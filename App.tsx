
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
  STORE_NAMES
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
    console.error("XLSX library is not loaded. Cannot generate report.");
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
    console.log(`Simulated: XLSX report "${reportFileName}" generated and offered for download.`);
    return true;
  } catch (error) {
    console.error("Error generating or writing XLSX file:", error);
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
        const swUrl = `${window.location.origin}/service-worker.js`;
        console.log('SW: Preparing to register Service Worker (deferred) from URL:', swUrl);

        setTimeout(() => {
          if (navigator.serviceWorker) {
            console.log('SW: Executing navigator.serviceWorker.register (deferred). URL:', swUrl);
            navigator.serviceWorker.register(swUrl)
              .then(registration => {
                console.log('Service Worker registered with scope:', registration.scope);

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
                      console.error("App: Error parsing submissions for SW INIT_STATE:", e);
                    }
                  }
                  console.log('SW: Sending INIT_STATE to service worker.');
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
                  console.log('SW: Service worker already active. Sending INIT_STATE.');
                  sendInitialStateToWorker(registration.active);
                }
                else if (registration.installing) {
                  const installingWorker = registration.installing;
                  console.log('SW: Service worker installing. Adding statechange listener.');
                  installingWorker.addEventListener('statechange', function swStateListener() {
                    if (installingWorker.state === 'activated') {
                      console.log('SW: Service worker activated via installing worker.');
                      if (registration.active) {
                        sendInitialStateToWorker(registration.active);
                      } else {
                        console.warn('SW activated via installing worker, but registration.active is null. Using the worker instance directly.');
                        sendInitialStateToWorker(installingWorker);
                      }
                      installingWorker.removeEventListener('statechange', swStateListener);
                    }
                  });
                }
                else if (navigator.serviceWorker.controller) {
                   console.log('SW: A controller already exists. Sending INIT_STATE to current page controller.');
                  sendInitialStateToWorker(navigator.serviceWorker.controller);
                }
                 else {
                  console.warn("SW: Service worker from this registration is not immediately active or installing, and no current controller. Waiting for controllerchange.");
                  const controllerChangeListener = () => {
                      if (navigator.serviceWorker.controller) {
                          console.log('SW: Controller became available after controllerchange event. Sending INIT_STATE.');
                          sendInitialStateToWorker(navigator.serviceWorker.controller);
                          navigator.serviceWorker.removeEventListener('controllerchange', controllerChangeListener);
                      }
                  };
                  navigator.serviceWorker.addEventListener('controllerchange', controllerChangeListener, { once: true });
                }
              })
              .catch(error => {
                console.error('Service Worker registration failed (deferred):', error, 'Attempted URL:', swUrl);
              });
          } else {
             console.error('SW: navigator.serviceWorker is not available for registration (deferred), though "serviceWorker" in navigator is true.');
          }
        }, 0); 

        Notification.requestPermission().then(permission => {
          setNotificationPermission(permission);
          if (permission !== 'granted') {
            console.warn('Notification permission not granted initially. User can enable via button.');
          } else {
            console.log('Notification permission granted initially.');
          }
        });
      } else {
        console.warn('Service Workers or Notifications API not supported in this browser.');
      }
    };

    if (document.readyState === 'complete') {
      console.log('Document already complete. Registering SW and permissions.');
      registerServiceWorkerAndPermissions();
    } else {
      console.log('Document not complete. Adding load event listener for SW registration.');
      window.addEventListener('load', registerServiceWorkerAndPermissions);
      return () => {
        console.log('Removing load event listener for SW registration.');
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
              console.warn(`App: Loaded submission at index ${index} is missing critical fields or has incorrect types, skipping:`, s);
              return null;
            }
            const submittedAtDate = new Date(s.submittedAt);
            if (isNaN(submittedAtDate.getTime())) {
              console.warn(`App: Loaded submission at index ${index} has an invalid 'submittedAt' date, skipping:`, s);
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
            console.error(`App: Error processing loaded submission at index ${index}:`, s, mapError);
            return null; 
          }
        }).filter((s: Submission | null): s is Submission => s !== null);
        setSubmissions(parsedSubmissions);
      }
    } catch (error) {
        console.error("App: Error loading submissions from localStorage:", error);
        localStorage.removeItem(`submissions_${todayStr}`);
    }

    try {
        const loadedReportStatus = localStorage.getItem(`reportSent_${todayStr}`);
        if (loadedReportStatus === 'true') {
          setReportSentToday(true);
        }
    } catch (error) {
        console.error("App: Error loading report status from localStorage:", error);
        localStorage.removeItem(`reportSent_${todayStr}`);
    }

    return () => clearInterval(timerId);
  }, []);

  useEffect(() => {
    try {
      const validSubmissions = submissions.filter(s => s.storeName && s.reminderId && s.status && s.submittedAt);
      localStorage.setItem(`submissions_${getTodayDateString()}`, JSON.stringify(validSubmissions));
    } catch (error) {
      console.error("App: Error saving submissions to localStorage:", error);
      alert("Veriler kaydedilirken bir depolama hatası oluştu. Bazı veriler kaybolmuş olabilir. Lütfen konsolu kontrol edin veya geliştiriciye bildirin.");
    }
  }, [submissions]);

  useEffect(() => {
    try {
      localStorage.setItem(`reportSent_${getTodayDateString()}`, reportSentToday.toString());
    } catch (error) {
        console.error("App: Error saving report status to localStorage:", error);
    }
  }, [reportSentToday]);

  const submissionsForCurrentDay = useMemo(() => {
    const currentDayStr = getTodayDateString(); 
    return submissions.filter(s => {
      try {
        // s.submittedAt should already be a Date object from the loading logic
        if (!s || !s.submittedAt || !(s.submittedAt instanceof Date) || isNaN(s.submittedAt.getTime())) {
          // console.warn("App: submissionsForCurrentDay - Invalid submission object or submittedAt date:", s);
          return false; 
        }
        const submissionDate = s.submittedAt; // Use the Date object directly
        const submissionDateStr = `${submissionDate.getFullYear()}-${(submissionDate.getMonth() + 1).toString().padStart(2, '0')}-${submissionDate.getDate().toString().padStart(2, '0')}`;
        return submissionDateStr === currentDayStr;
      } catch (filterError) {
        console.error(`App: Error processing submission in filter for submissionsForCurrentDay:`, s, filterError);
        return false;
      }
    });
  }, [submissions, currentTime]); 

  const checkReportTime = useCallback(() => {
    const currentHour = currentTime.getHours();
    const currentMinute = currentTime.getMinutes();
    const HHMM = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;

    if (HHMM === REPORT_TIME && !reportSentToday) {
      if (typeof XLSX === 'undefined') {
        alert(`Saat ${REPORT_TIME}. Rapor oluşturulamadı: XLSX kütüphanesi yüklenmemiş. Lütfen 'index.html' dosyasına ilgili script etiketini ekleyin veya geliştiriciye bildirin.`);
        console.error("XLSX library is not loaded. Cannot generate report.");
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
    console.log('App: handleSaveSubmission: received data (File object metadata logged if present):', {
        ...submissionData,
        depositSlipFile: originalFile ? { name: originalFile.name, type: originalFile.type, size: originalFile.size, lastModified: originalFile.lastModified } : undefined,
        depositSlipPreview: submissionData.depositSlipPreview ? submissionData.depositSlipPreview.substring(0, 100) + '...' : undefined
    });

    const newSubmissionForState: Submission = {
      ...submissionData, 
      id: `${submissionData.storeName}-${submissionData.reminderId}-${getTodayDateString()}-${Date.now()}`,
      submittedAt: new Date(),
      depositSlipFile: undefined, 
    };

    console.log('App: handleSaveSubmission: newSubmission object prepared for state (depositSlipFile is undefined):', {
        ...newSubmissionForState,
        depositSlipPreview: newSubmissionForState.depositSlipPreview ? newSubmissionForState.depositSlipPreview.substring(0, 100) + '...' : undefined
    });

    try {
        setSubmissions(prevSubmissions => {
          console.log('App: setSubmissions: updating submissions. Previous length:', prevSubmissions.length);
          const submissionDateString = getTodayDateString(); 

          const existingIndex = prevSubmissions.findIndex(
            s => s.storeName === newSubmissionForState.storeName &&
                 s.reminderId === newSubmissionForState.reminderId && 
                 s.submittedAt instanceof Date && !isNaN(s.submittedAt.getTime()) &&
                 `${s.submittedAt.getFullYear()}-${(s.submittedAt.getMonth() + 1).toString().padStart(2, '0')}-${s.submittedAt.getDate().toString().padStart(2, '0')}` === submissionDateString
          );
          let updatedSubmissions;
          if (existingIndex > -1) {
            updatedSubmissions = [...prevSubmissions];
            updatedSubmissions[existingIndex] = newSubmissionForState;
            console.log('App: setSubmissions: updated existing submission at index', existingIndex, 'for store', newSubmissionForState.storeName, 'slot', newSubmissionForState.reminderId);
          } else {
            updatedSubmissions = [...prevSubmissions, newSubmissionForState];
            console.log('App: setSubmissions: added new submission. New length:', updatedSubmissions.length);
          }
          return updatedSubmissions;
        });
    } catch (error) {
        console.error("App: handleSaveSubmission: Error during setSubmissions call:", error);
        alert("Veri kaydedilirken bir uygulama hatası oluştu (setSubmissions). Lütfen konsolu kontrol edin veya geliştiriciye bildirin.");
        return; 
    }
    console.log('App: handleSaveSubmission: setSubmissions call completed.');

    if (navigator.serviceWorker.controller) {
      console.log('App: Sending SUBMISSION_MADE to service worker controller.');
      navigator.serviceWorker.controller.postMessage({
        type: 'SUBMISSION_MADE',
        data: {
          reminderId: newSubmissionForState.reminderId, 
          date: getTodayDateString(),
        }
      });
    } else {
       console.warn('App: No service worker controller available to send SUBMISSION_MADE.');
    }
    console.log('App: handleSaveSubmission: finished successfully.');
  };

  const handleRequestNotificationPermission = () => {
    if ('Notification' in window) {
      Notification.requestPermission().then(permission => {
        setNotificationPermission(permission);
        if (permission === 'granted') {
          console.log('Notification permission granted by user action.');
        } else {
          console.warn('Notification permission not granted by user action.');
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
