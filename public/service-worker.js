
// Global scope for service worker variables
let REMINDER_SLOTS_SW = [];
let REPORT_TIME_SW = '20:00'; // Not directly used for notifications by SW, but good to have.
let APP_TITLE_SW = 'Watsons Nakit Yönetimi';
let NOTIFICATION_ICON_URL_SW = 'icon-192x192.png'; // Relative path
let NOTIFICATION_SOUND_URL_SW = 'notification.mp3'; // Relative path
let NOTIFICATION_REPEAT_INTERVAL_SW = 30 * 60 * 1000; // 30 minutes

let todayServiceWorkerDateString = '';
let pendingSubmissionsForToday = new Set(); // Set of ReminderId strings
let lastNotificationTime = {}; // { [ReminderId: string]: number }
let intervalId = null;

function getTodayDateStringSw() {
  const today = new Date();
  const year = today.getFullYear();
  const month = (today.getMonth() + 1).toString().padStart(2, '0');
  const day = today.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

self.addEventListener('install', (event) => {
  console.log('SW: Yükleme olayı');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('SW: Etkinleştirme olayı');
  event.waitUntil(clients.claim());
  // Initialization of daily state and interval will happen on 'INIT_STATE' message
});

function initializeDailyState(currentDateString, allReminderIds, submittedTodayIds) {
  todayServiceWorkerDateString = currentDateString;
  pendingSubmissionsForToday = new Set(allReminderIds.map(id => String(id))); // Ensure string IDs
  submittedTodayIds.forEach(id => pendingSubmissionsForToday.delete(String(id)));
  lastNotificationTime = {}; // Reset notification timestamps for the new day/init
  console.log(`SW: Günlük durum ${todayServiceWorkerDateString} için başlatıldı. Bekleyenler: [${Array.from(pendingSubmissionsForToday).join(', ')}]`);
}

self.addEventListener('message', (event) => {
  const { type, data } = event.data;

  if (type === 'INIT_STATE') {
    console.log('SW: INIT_STATE alındı', data);
    REMINDER_SLOTS_SW = data.reminderSlots;
    REPORT_TIME_SW = data.reportTime;
    APP_TITLE_SW = data.appTitle;
    NOTIFICATION_ICON_URL_SW = data.notificationIconUrl;
    NOTIFICATION_SOUND_URL_SW = data.notificationSoundUrl;
    NOTIFICATION_REPEAT_INTERVAL_SW = data.notificationRepeatInterval; 

    const allReminderIds = REMINDER_SLOTS_SW.map(slot => slot.id);
    const submittedTodayIds = data.submissions
      .filter(s => {
        // Ensure s.submittedAt is treated as a Date for correct comparison
        const subDate = s.submittedAt instanceof Date ? s.submittedAt : new Date(s.submittedAt);
        if (isNaN(subDate.getTime())) {
            // console.warn('SW: INIT_STATE - Invalid date in submission:', s);
            return false;
        }
        const subDateString = `${subDate.getFullYear()}-${(subDate.getMonth() + 1).toString().padStart(2, '0')}-${subDate.getDate().toString().padStart(2, '0')}`;
        return subDateString === data.currentDateString;
      })
      .map(s => s.reminderId);

    initializeDailyState(data.currentDateString, allReminderIds, submittedTodayIds);

    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(checkRemindersAndNotify, 60000); 
    console.log('SW: checkRemindersAndNotify için zamanlayıcı başlatıldı.');
    checkRemindersAndNotify(); // Perform an initial check
  } else if (type === 'SUBMISSION_MADE') {
    console.log('SW: SUBMISSION_MADE alındı', data);
    if (data.date === todayServiceWorkerDateString) {
      pendingSubmissionsForToday.delete(String(data.reminderId));
      delete lastNotificationTime[String(data.reminderId)]; 
      console.log(`SW: ${data.reminderId} için ${data.date} tarihinde gönderim kaydedildi. Bekleyenler: [${Array.from(pendingSubmissionsForToday).join(', ')}]`);
      closeNotification(String(data.reminderId));
    }
  }
});

async function closeNotification(reminderIdTag) {
  if (!self.registration || typeof self.registration.getNotifications !== 'function') {
    // console.log('SW_DEBUG: Closing notifications not supported or registration not available.');
    return;
  }
  try {
    const notifications = await self.registration.getNotifications({ tag: reminderIdTag });
    if (notifications && notifications.length > 0) {
        // console.log(`SW_DEBUG: Closing ${notifications.length} notification(s) with tag ${reminderIdTag}.`);
        notifications.forEach(notification => notification.close());
    }
  } catch (error) {
    console.error("SW: Bildirim kapatılırken hata:", error);
  }
}

function checkRemindersAndNotify() {
  const now = new Date();
  const currentSwDateString = getTodayDateStringSw();

  if (currentSwDateString !== todayServiceWorkerDateString) {
    console.log(`SW: Tarih ${todayServiceWorkerDateString} tarihinden ${currentSwDateString} tarihine değişti. Günlük durum yeniden başlatılıyor.`);
    const allReminderIds = REMINDER_SLOTS_SW.map(slot => slot.id);
    initializeDailyState(currentSwDateString, allReminderIds, []); 
    // console.log('SW_DEBUG: Daily state re-initialized due to date change.');
  }

  if (!REMINDER_SLOTS_SW || REMINDER_SLOTS_SW.length === 0) {
    // console.log('SW_DEBUG: Reminder slots not initialized or empty. Skipping check.');
    return;
  }

  // console.log(`SW_DEBUG: Check Reminders at ${now.toISOString()} for date ${todayServiceWorkerDateString}. Pending: [${Array.from(pendingSubmissionsForToday).join(', ')}]`);

  REMINDER_SLOTS_SW.forEach(slot => {
    const slotIdStr = String(slot.id);
    if (pendingSubmissionsForToday.has(slotIdStr)) {
      const [slotHour, slotMinute] = slot.time.split(':').map(Number);
      const baseDateParts = todayServiceWorkerDateString.split('-').map(Number);
      const slotTimeToday = new Date(baseDateParts[0], baseDateParts[1] - 1, baseDateParts[2], slotHour, slotMinute);

      // console.log(`SW_DEBUG: Slot ${slotIdStr} (${slot.time}): Slot time today: ${slotTimeToday.toISOString()}, Now: ${now.toISOString()}`);

      if (now >= slotTimeToday) {
        // console.log(`SW_DEBUG: Slot ${slotIdStr} is active (now >= slotTimeToday).`);
        const lastNotifTimestamp = lastNotificationTime[slotIdStr];
        const timeSinceLastNotification = lastNotifTimestamp ? now.getTime() - lastNotifTimestamp : Infinity;
        
        // console.log(`SW_DEBUG: Slot ${slotIdStr}: Last notification at: ${lastNotifTimestamp ? new Date(lastNotifTimestamp).toISOString() : 'N/A'}. Time since: ${Math.round(timeSinceLastNotification/1000)}s. Repeat interval: ${NOTIFICATION_REPEAT_INTERVAL_SW/1000}s.`);

        if (timeSinceLastNotification >= NOTIFICATION_REPEAT_INTERVAL_SW) {
          // console.log(`SW_DEBUG: Slot ${slotIdStr}: Time for notification. Permission: ${self.Notification ? self.Notification.permission : 'N/A'}`);
          if (self.Notification && self.Notification.permission === 'granted') {
            // console.log(`SW_DEBUG: Slot ${slotIdStr}: Attempting to show notification.`);
            const notificationOptions = {
              body: `"${slot.label}" için para yatırma zamanı! Lütfen durumu güncelleyin. Saat: ${slot.time}`,
              icon: NOTIFICATION_ICON_URL_SW,
              tag: slotIdStr, 
              renotify: true,
              vibrate: [200, 100, 200, 100, 200],
              data: { reminderId: slotIdStr, url: './' } 
            };
            if (self.registration && typeof self.registration.showNotification === 'function') {
                self.registration.showNotification(`${APP_TITLE_SW} Hatırlatması`, notificationOptions)
                .then(() => {
                  console.log(`SW: ${slotIdStr} (${slot.label}) için bildirim ${now.toLocaleTimeString()} zamanında gösterildi.`);
                  lastNotificationTime[slotIdStr] = now.getTime();
                })
                .catch(err => {
                  console.error(`SW: ${slotIdStr} (${slot.label}) için bildirim gösterilirken hata:`, err);
                });
            } else {
                console.warn(`SW_DEBUG: Slot ${slotIdStr}: self.registration.showNotification is not available.`);
            }
          } else {
            // console.log(`SW_DEBUG: Slot ${slotIdStr}: Notification permission not granted ('${self.Notification ? self.Notification.permission : 'N/A'}') or Notification API not available.`);
          }
        } else {
          // console.log(`SW_DEBUG: Slot ${slotIdStr}: Not time for repeat notification yet.`);
        }
      } else {
        // console.log(`SW_DEBUG: Slot ${slotIdStr}: Slot time not yet reached.`);
      }
    } else {
      // console.log(`SW_DEBUG: Slot ${slotIdStr} (${slot.label}) is not pending. Skipping.`);
    }
  });
}

self.addEventListener('notificationclick', (event) => {
  console.log('SW: Bildirime tıklandı:', event.notification);
  event.notification.close();

  const targetUrl = event.notification.data && event.notification.data.url ? event.notification.data.url : './';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        try {
            const clientBasePath = new URL(client.url, self.registration.scope).pathname;
            const scopePath = new URL(self.registration.scope).pathname;
            if (clientBasePath.startsWith(scopePath) && 'focus' in client) {
                return client.focus();
            }
        } catch (e) {
            console.warn("SW: İstemci URLsi ayrıştırılırken veya istemciye odaklanırken hata:", e, client.url);
        }
      }
      if (clients.openWindow) {
        const absoluteTargetUrl = new URL(targetUrl, self.registration.scope).href;
        return clients.openWindow(absoluteTargetUrl);
      }
    })
  );
});
