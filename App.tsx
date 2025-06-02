
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from './components/Header';
import { ReminderCard } from './components/ReminderCard';
import { ReportModal } from './components/ReportModal';
import { Submission, ReminderSlot, ReminderId, DepositStatus } from './types';
import {
  REMINDER_SLOTS,
  REPORT_EMAIL_RECIPIENT,
  REPORT_TIME,
  APP_TITLE,
  NOTIFICATION_ICON_URL,
  NOTIFICATION_SOUND_URL,
  NOTIFICATION_REPEAT_INTERVAL,
  STORE_NAMES,
  MAX_BASE64_PREVIEW_STORAGE_LENGTH
} from './constants';

declare var XLSX: any; 

const getTodayDateString = (): string => {
  const today = new Date();
  const year = today.getFullYear();
  const month = (today.getMonth() + 1).toString().padStart(2, '0');
  const day = today.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const generateAndSimulateSendReport = (
  depositedSubmissions: Submission[],
  notDepositedSubmissions: Submission[],
  reportDate: Date
): boolean => {
  if (typeof XLSX === 'undefined') {
    console.error("XLSX kütüphanesi yüklenemedi. Rapor oluşturulamıyor.");
    return false;
  }

  try {
    const wb = XLSX.utils.book_new();
    const reportFileName = `Gunluk_Nakit_Yonetimi_Raporu_${reportDate.getFullYear()}-${(reportDate.getMonth() + 1).toString().padStart(2, '0')}-${reportDate.getDate().toString().padStart(2, '0')}.xlsx`;

    if (depositedSubmissions.length > 0) {
      const depositedData = depositedSubmissions.map(s => ({
        'Mağaza Adı': s.storeName,
        'Hatırlatma': s.reminderLabel,
        'İşlem Saati': new Date(s.submittedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
        'Dekont Dosya Adı': s.depositSlipFileName || 'N/A',
      }));
      const wsDeposited = XLSX.utils.json_to_sheet(depositedData);
      XLSX.utils.book_append_sheet(wb, wsDeposited, 'Yatırılanlar');
    } else {
      const wsDeposited = XLSX.utils.json_to_sheet([{'Durum': 'Bugün yatırılan işlem bulunmamaktadır.'}]);
      XLSX.utils.book_append_sheet(wb, wsDeposited, 'Yatırılanlar');
    }

    if (notDepositedSubmissions.length > 0) {
      const notDepositedData = notDepositedSubmissions.map(s => ({
        'Mağaza Adı': s.storeName,
        'Hatırlatma': s.reminderLabel,
        'İşlem Saati': new Date(s.submittedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
        'Açıklama': s.explanation || 'Açıklama Yok',
      }));
      const wsNotDeposited = XLSX.utils.json_to_sheet(notDepositedData);
      XLSX.utils.book_append_sheet(wb, wsNotDeposited, 'Yatırılmayanlar');
    } else {
       const wsNotDeposited = XLSX.utils.json_to_sheet([{'Durum': 'Bugün yatırılmayan olarak işaretlenen işlem bulunmamaktadır.'}]);
      XLSX.utils.book_append_sheet(wb, wsNotDeposited, 'Yatırılmayanlar');
    }

    const allSubmissionsForDay = [...depositedSubmissions, ...notDepositedSubmissions];
    const submittedStoreNamesToday = new Set(allSubmissionsForDay.map(s => s.storeName));
    
    const noEntryStoreNames = STORE_NAMES.filter(name => !submittedStoreNamesToday.has(name));

    if (noEntryStoreNames.length > 0) {
      const noEntryData = noEntryStoreNames.map(name => ({
        'Mağaza Adı': name,
      }));
      const wsNoEntry = XLSX.utils.json_to_sheet(noEntryData);
      XLSX.utils.book_append_sheet(wb, wsNoEntry, 'Giriş Yapmayanlar');
    } else {
      const wsNoEntry = XLSX.utils.json_to_sheet([{'Durum': 'Tüm mağazalar bugün en az bir giriş yapmıştır.'}]);
      XLSX.utils.book_append_sheet(wb, wsNoEntry, 'Giriş Yapmayanlar');
    }

    XLSX.writeFile(wb, reportFileName);
    console.log(`Simülasyon: XLSX raporu "${reportFileName}" oluşturuldu ve indirilmek üzere sunuldu.`);
    return true;
  } catch (error) {
    console.error("XLSX dosyası oluşturulurken veya yazılırken hata:", error);
    return false;
  }
};


const App: React.FC = () => {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [showReportModal, setShowReportModal] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [reportSentToday, setReportSentToday] = useState<boolean>(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | null>(null);

  useEffect(() => {
    const registerServiceWorkerAndPermissions = () => {
      if ('serviceWorker' in navigator && 'Notification' in window) {
        const swUrl = 'service-worker.js'; // Use relative path
        console.log('SW: Servis Çalışanını kaydetmeye hazırlanılıyor (ertelenmiş), URL:', swUrl);

        setTimeout(() => {
          if (navigator.serviceWorker) {
            console.log('SW: navigator.serviceWorker.register yürütülüyor (ertelenmiş). URL:', swUrl);
            navigator.serviceWorker.register(swUrl) // No need for window.location.origin
              .then(registration => {
                console.log('Servis Çalışanı kaydedildi, kapsam:', registration.scope);

                const sendInitialStateToWorker = (sw: ServiceWorker) => {
                  const todayStr = getTodayDateString();
                  const loadedSubmissions = localStorage.getItem(`submissions_${todayStr}`);
                  let parsedSubmissionsForSW: Submission[] = [];
                  if (loadedSubmissions) {
                    try {
                       parsedSubmissionsForSW = JSON.parse(loadedSubmissions).map((s: any) => ({
                          ...s,
                          submittedAt: new Date(s.submittedAt),
                          depositSlipFile: undefined
                      })).filter((s: Submission | null) => s !== null && s.submittedAt instanceof Date && !isNaN(s.submittedAt.getTime()));
                    } catch (e) {
                      console.error("App: SW INIT_STATE için gönderimler ayrıştırılırken hata:", e);
                    }
                  }
                  console.log('SW: INIT_STATE servis çalışanına gönderiliyor.');
                  sw.postMessage({
                    type: 'INIT_STATE',
                    data: {
                      reminderSlots: REMINDER_SLOTS,
                      reportTime: REPORT_TIME,
                      appTitle: APP_TITLE,
                      notificationIconUrl: NOTIFICATION_ICON_URL,
                      notificationSoundUrl: NOTIFICATION_SOUND_URL,
                      notificationRepeatInterval: NOTIFICATION_REPEAT_INTERVAL,
                      submissions: parsedSubmissionsForSW,
                      currentDateString: todayStr,
                      currentDate: new Date().toISOString(),
                    }
                  });
                };

                if (registration.active) {
                  console.log('SW: Servis çalışanı zaten aktif. INIT_STATE gönderiliyor.');
                  sendInitialStateToWorker(registration.active);
                }
                else if (registration.installing) {
                  const installingWorker = registration.installing;
                  console.log('SW: Servis çalışanı yükleniyor. Statechange dinleyicisi ekleniyor.');
                  installingWorker.addEventListener('statechange', function swStateListener() {
                    if (installingWorker.state === 'activated') {
                      console.log('SW: Servis çalışanı yüklenen çalışan üzerinden etkinleştirildi.');
                      if (registration.active) {
                        sendInitialStateToWorker(registration.active);
                      } else {
                        console.warn('SW yüklenen çalışan üzerinden etkinleştirildi, ancak registration.active null. Çalışan örneği doğrudan kullanılıyor.');
                        sendInitialStateToWorker(installingWorker);
                      }
                      installingWorker.removeEventListener('statechange', swStateListener);
                    }
                  });
                }
                else if (navigator.serviceWorker.controller) {
                   console.log('SW: Bir denetleyici zaten mevcut. INIT_STATE mevcut sayfa denetleyicisine gönderiliyor.');
                  sendInitialStateToWorker(navigator.serviceWorker.controller);
                }
                 else {
                  console.warn("SW: Bu kayıttan servis çalışanı hemen aktif veya yüklenmiyor ve mevcut denetleyici yok. Controllerchange bekleniyor.");
                  const controllerChangeListener = () => {
                      if (navigator.serviceWorker.controller) {
                          console.log('SW: Denetleyici controllerchange olayı sonrası kullanılabilir oldu. INIT_STATE gönderiliyor.');
                          sendInitialStateToWorker(navigator.serviceWorker.controller);
                          navigator.serviceWorker.removeEventListener('controllerchange', controllerChangeListener);
                      }
                  };
                  navigator.serviceWorker.addEventListener('controllerchange', controllerChangeListener, { once: true });
                }
              })
              .catch(error => {
                console.error('Servis Çalışanı kaydı başarısız oldu (ertelenmiş):', error, 'Denenen URL:', swUrl);
              });
          } else {
             console.error('SW: navigator.serviceWorker kayıt için uygun değil (ertelenmiş), "serviceWorker" in navigator true olmasına rağmen.');
          }
        }, 0); 

        Notification.requestPermission().then(permission => {
          setNotificationPermission(permission);
          if (permission !== 'granted') {
            console.warn('Bildirim izni başlangıçta verilmedi. Kullanıcı buton aracılığıyla etkinleştirebilir.');
          } else {
            console.log('Bildirim izni başlangıçta verildi.');
          }
        });
      } else {
        console.warn('Servis Çalışanları veya Bildirimler API\'si bu tarayıcıda desteklenmiyor.');
      }
    };

    if (document.readyState === 'complete') {
      console.log('Belge zaten tamamlandı. SW ve izinler kaydediliyor.');
      registerServiceWorkerAndPermissions();
    } else {
      console.log('Belge tamamlanmadı. SW kaydı için yükleme olayı dinleyicisi ekleniyor.');
      window.addEventListener('load', registerServiceWorkerAndPermissions);
      return () => {
        console.log('SW kaydı için yükleme olayı dinleyicisi kaldırılıyor.');
        window.removeEventListener('load', registerServiceWorkerAndPermissions);
      };
    }
  }, []);

  useEffect(() => {
    const timerId = setInterval(() => {
      setCurrentTime(new Date());
    }, 60 * 1000);

    const todayStr = getTodayDateString();
    try {
      const loadedSubmissions = localStorage.getItem(`submissions_${todayStr}`);
      if (loadedSubmissions) {
        const parsedSubmissions: Submission[] = JSON.parse(loadedSubmissions).map((s: any, index: number) => {
          try {
            if (!s || typeof s.storeName !== 'string' || typeof s.reminderId !== 'string' || typeof s.status !== 'string' || !s.submittedAt) {
              console.warn(`App: Yüklenen ${index}. gönderim kritik alanları eksik veya yanlış türlere sahip, atlanıyor:`, s);
              return null;
            }
            const submittedAtDate = new Date(s.submittedAt);
            if (isNaN(submittedAtDate.getTime())) {
              console.warn(`App: Yüklenen ${index}. gönderim geçersiz bir 'submittedAt' tarihine sahip, atlanıyor:`, s);
              return null;
            }
            return {
              id: String(s.id || `generated-${index}`),
              reminderId: s.reminderId as ReminderId,
              reminderLabel: String(s.reminderLabel),
              storeName: String(s.storeName),
              status: s.status as DepositStatus,
              depositSlipPreview: typeof s.depositSlipPreview === 'string' ? s.depositSlipPreview : undefined,
              depositSlipFileName: typeof s.depositSlipFileName === 'string' ? s.depositSlipFileName : undefined,
              explanation: typeof s.explanation === 'string' ? s.explanation : undefined,
              submittedAt: submittedAtDate,
              depositSlipFile: undefined 
            };
          } catch (mapError) {
            console.error(`App: Yüklenen ${index}. gönderim işlenirken hata:`, s, mapError);
            return null; 
          }
        }).filter((s: Submission | null): s is Submission => s !== null);
        setSubmissions(parsedSubmissions);
      }
    } catch (error) {
        console.error("App: localStorage'dan gönderimler yüklenirken hata:", error);
        localStorage.removeItem(`submissions_${todayStr}`);
    }

    try {
        const loadedReportStatus = localStorage.getItem(`reportSent_${todayStr}`);
        if (loadedReportStatus === 'true') {
          setReportSentToday(true);
        }
    } catch (error) {
        console.error("App: localStorage'dan rapor durumu yüklenirken hata:", error);
        localStorage.removeItem(`reportSent_${todayStr}`);
    }

    return () => clearInterval(timerId);
  }, []);

  useEffect(() => {
    try {
      const validSubmissions = submissions.filter(s => s.storeName && s.reminderId && s.status && s.submittedAt);
      localStorage.setItem(`submissions_${getTodayDateString()}`, JSON.stringify(validSubmissions));
    } catch (error: any) {
      console.error("App: Gönderimler localStorage'a kaydedilirken hata:", error.name, error.message, error);
      alert("Veriler kaydedilirken bir depolama hatası oluştu. Bazı veriler kaybolmuş olabilir. Lütfen konsolu kontrol edin veya geliştiriciye bildirin.");
    }
  }, [submissions]);

  useEffect(() => {
    try {
      localStorage.setItem(`reportSent_${getTodayDateString()}`, reportSentToday.toString());
    } catch (error) {
        console.error("App: Rapor durumu localStorage'a kaydedilirken hata:", error);
    }
  }, [reportSentToday]);

  const submissionsForCurrentDay = useMemo(() => {
    const currentDayStr = getTodayDateString(); // Use YYYY-MM-DD for consistent comparison
    return submissions.filter(s => {
      try {
        if (!s || !s.submittedAt || !(s.submittedAt instanceof Date) || isNaN(s.submittedAt.getTime())) {
          // console.warn("App: submissionsForCurrentDay - Invalid submission object or submittedAt date:", s);
          return false; 
        }
        const submissionDate = new Date(s.submittedAt);
        // Re-normalize submissionDate to YYYY-MM-DD string for comparison
        const submissionDateStr = `${submissionDate.getFullYear()}-${(submissionDate.getMonth() + 1).toString().padStart(2, '0')}-${submissionDate.getDate().toString().padStart(2, '0')}`;
        return submissionDateStr === currentDayStr;
      } catch (filterError) {
        console.error(`App: submissionsForCurrentDay filtresinde gönderim işlenirken hata:`, s, filterError);
        return false;
      }
    });
  }, [submissions, currentTime]); // currentTime is still needed to trigger re-calc on minute changes for slot active status, but date comparison is now more robust.

  const checkReportTime = useCallback(() => {
    const currentHour = currentTime.getHours();
    const currentMinute = currentTime.getMinutes();
    const HHMM = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;

    if (HHMM === REPORT_TIME && !reportSentToday) {
      if (typeof XLSX === 'undefined') {
        alert(`Saat ${REPORT_TIME}. Rapor oluşturulamadı: XLSX kütüphanesi yüklenmemiş. Lütfen 'index.html' dosyasına ilgili script etiketini ekleyin veya geliştiriciye bildirin.`);
        console.error("XLSX kütüphanesi yüklenemedi. Rapor oluşturulamıyor.");
        return;
      }

      const depositedSubmissions = submissionsForCurrentDay.filter(s => s.status === DepositStatus.DEPOSITED);
      const notDepositedSubmissions = submissionsForCurrentDay.filter(s => s.status === DepositStatus.NOT_DEPOSITED);
      
      const reportGeneratedSuccessfully = generateAndSimulateSendReport(depositedSubmissions, notDepositedSubmissions, new Date());
      
      if (reportGeneratedSuccessfully) {
         alert(`Saat ${REPORT_TIME}. Günlük ${APP_TITLE} raporu (XLSX formatında; Yatırılanlar, Yatırılmayanlar ve Giriş Yapmayan Mağazalar ayrı sayfalarda) ${REPORT_EMAIL_RECIPIENT} adresine gönderildi ve indirilmek üzere hazırlandı (Simülasyon).`);
         setReportSentToday(true);
      } else {
         alert(`Saat ${REPORT_TIME}. ${APP_TITLE} raporu (${REPORT_EMAIL_RECIPIENT} adresine) oluşturulurken bir hata oluştu. Lütfen konsolu kontrol edin. (Simülasyon)`);
      }
    }
  }, [currentTime, submissionsForCurrentDay, reportSentToday ]);

  useEffect(() => {
    checkReportTime();
  }, [checkReportTime]);

  const handleSaveSubmission = (submissionData: Omit<Submission, 'id' | 'submittedAt'>) => {
    const originalFile = submissionData.depositSlipFile; 
    console.log('App: handleSaveSubmission: alınan veri (Dosya nesnesi meta verisi varsa loglanır):', {
        ...submissionData,
        depositSlipFile: originalFile ? { name: originalFile.name, type: originalFile.type, size: originalFile.size, lastModified: originalFile.lastModified } : undefined,
        depositSlipPreview: submissionData.depositSlipPreview ? submissionData.depositSlipPreview.substring(0, 100) + '...' : undefined
    });

    const submissionToPersist: Submission = {
      ...submissionData, 
      id: `${submissionData.storeName}-${submissionData.reminderId}-${getTodayDateString()}-${Date.now()}`,
      submittedAt: new Date(),
      depositSlipFile: undefined, // Actual file object is not persisted in state/localStorage
      // depositSlipPreview and depositSlipFileName are from submissionData
    };

    // Check if preview is too large for localStorage
    if (submissionToPersist.depositSlipPreview &&
        submissionToPersist.depositSlipPreview.length > MAX_BASE64_PREVIEW_STORAGE_LENGTH) {
      console.warn(
        `App: Dekont önizlemesi (${submissionToPersist.depositSlipPreview.length} karakter) localStorage için çok büyük. Kaldırılıyor. Dosya Adı: ${submissionToPersist.depositSlipFileName}`
      );
      submissionToPersist.depositSlipPreview = undefined; // Remove large preview, keep filename
    }

    console.log('App: handleSaveSubmission: durum için hazırlanan gönderim nesnesi (gerekirse önizleme kaldırıldı):', {
        ...submissionToPersist,
        depositSlipPreview: submissionToPersist.depositSlipPreview ? submissionToPersist.depositSlipPreview.substring(0, 100) + '...' : undefined
    });

    try {
        setSubmissions(prevSubmissions => {
          console.log('App: setSubmissions: gönderimler güncelleniyor. Önceki sayı:', prevSubmissions.length);
          const submissionDateString = getTodayDateString(); // Date for comparison

          const existingIndex = prevSubmissions.findIndex(
            s => s.storeName === submissionToPersist.storeName &&
                 s.reminderId === submissionToPersist.reminderId && 
                 s.submittedAt instanceof Date && !isNaN(s.submittedAt.getTime()) &&
                 `${s.submittedAt.getFullYear()}-${(s.submittedAt.getMonth() + 1).toString().padStart(2, '0')}-${s.submittedAt.getDate().toString().padStart(2, '0')}` === submissionDateString
          );
          let updatedSubmissions;
          if (existingIndex > -1) {
            updatedSubmissions = [...prevSubmissions];
            updatedSubmissions[existingIndex] = submissionToPersist;
            console.log('App: setSubmissions: mevcut gönderim güncellendi, index', existingIndex, 'mağaza', submissionToPersist.storeName, 'slot', submissionToPersist.reminderId);
          } else {
            updatedSubmissions = [...prevSubmissions, submissionToPersist];
            console.log('App: setSubmissions: yeni gönderim eklendi. Yeni sayı:', updatedSubmissions.length);
          }
          return updatedSubmissions;
        });
    } catch (error) {
        console.error("App: handleSaveSubmission: setSubmissions çağrısı sırasında hata:", error);
        alert("Veri kaydedilirken bir uygulama hatası oluştu (setSubmissions). Lütfen konsolu kontrol edin veya geliştiriciye bildirin.");
        return; 
    }
    console.log('App: handleSaveSubmission: setSubmissions çağrısı tamamlandı.');

    if (navigator.serviceWorker.controller) {
      console.log('App: SUBMISSION_MADE servis çalışanı denetleyicisine gönderiliyor.');
      navigator.serviceWorker.controller.postMessage({
        type: 'SUBMISSION_MADE',
        data: {
          reminderId: submissionToPersist.reminderId, 
          date: getTodayDateString(),
        }
      });
    } else {
       console.warn('App: SUBMISSION_MADE göndermek için servis çalışanı denetleyicisi yok.');
    }
    console.log('App: handleSaveSubmission: başarıyla tamamlandı.');
  };

  const handleRequestNotificationPermission = () => {
    if ('Notification' in window) {
      Notification.requestPermission().then(permission => {
        setNotificationPermission(permission);
        if (permission === 'granted') {
          console.log('Bildirim izni kullanıcı eylemiyle verildi.');
        } else {
          console.warn('Bildirim izni kullanıcı eylemiyle verilmedi.');
        }
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-700 text-gray-100 flex flex-col items-center p-4 font-sans">
      <Header />
      <main className="w-full max-w-4xl mt-8">
        <div className="mb-4 text-center">
          {notificationPermission === 'denied' && (
            <p className="text-yellow-400 bg-yellow-900/50 p-3 rounded-lg shadow">
              Bildirimlere izin verilmedi. Hatırlatmalar çalışmayacaktır. Lütfen tarayıcı ayarlarından izin verin.
            </p>
          )}
          {notificationPermission === 'default' && (
             <>
              <p className="text-blue-300 bg-blue-900/50 p-3 rounded-lg shadow mb-3">
                Hatırlatmalar için bildirim izni gerekli. Uygulamanın size hatırlatma gönderebilmesi için lütfen bildirimleri etkinleştirin.
              </p>
              <button
                onClick={handleRequestNotificationPermission}
                className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded-lg shadow-md transition duration-150 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-opacity-75"
                aria-label="Bildirimlere izin ver"
              >
                Bildirimlere İzin Ver
              </button>
            </>
          )}
           {notificationPermission === 'granted' && (
            <p className="text-green-400 bg-green-900/50 p-3 rounded-lg shadow">
              Bildirimler etkin. Hatırlatmalar aktif.
            </p>
          )}
        </div>
        <h2 className="text-3xl font-semibold mb-6 text-center text-sky-400">Bugünün Yatırma İşlemleri</h2>
        <div className="grid md:grid-cols-2 gap-6">
          {REMINDER_SLOTS.map(slot => {
            const currentHour = currentTime.getHours();
            const currentMinute = currentTime.getMinutes();
            const [slotHour, slotMinute] = slot.time.split(':').map(Number);
            const isSlotTimeActive = currentHour > slotHour || (currentHour === slotHour && currentMinute >= slotMinute);

            return (
              <ReminderCard
                key={slot.id}
                reminderSlot={slot}
                onSaveSubmission={handleSaveSubmission}
                allSubmissionsToday={submissionsForCurrentDay}
                isSlotActive={isSlotTimeActive}
              />
            );
          })}
        </div>
        <div className="mt-12 text-center">
          <button
            onClick={() => setShowReportModal(true)}
            className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-8 rounded-lg shadow-lg transition duration-150 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-75"
          >
            Günlük Raporu Görüntüle
          </button>
          <p className="text-sm text-gray-400 mt-2">
            Rapor saat {REPORT_TIME}'da otomatik olarak {REPORT_EMAIL_RECIPIENT} adresine (XLSX formatında) gönderilir. (Simülasyon)
          </p>
        </div>
      </main>
      {showReportModal && (
        <ReportModal
          submissions={submissionsForCurrentDay} 
          onClose={() => setShowReportModal(false)}
          reportEmailRecipient={REPORT_EMAIL_RECIPIENT}
        />
      )}
      <footer className="text-center text-gray-500 mt-12 pb-4">
        {APP_TITLE} &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
};

export default App;
