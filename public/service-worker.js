
// Global scope for service worker variables
let REMINDER_SLOTS_SW = [];
let REPORT_TIME_SW = '20:00'; // Not directly used for notifications by SW, but good to have.
let APP_TITLE_SW = 'Watsons Nakit Yönetimi';
let NOTIFICATION_ICON_URL_SW = '/icon-192x192.png';
let NOTIFICATION_SOUND_URL_SW = '/notification.mp3';
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
  console.log('SW: Install event');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('SW: Activate event');
  event.waitUntil(clients.claim());
  // Initialization of daily state and interval will happen on 'INIT_STATE' message
});

function initializeDailyState(currentDateString, allReminderIds, submittedTodayIds) {
  todayServiceWorkerDateString = currentDateString;
  pendingSubmissionsForToday = new Set(allReminderIds.map(id => String(id))); // Ensure string IDs
  submittedTodayIds.forEach(id => pendingSubmissionsForToday.delete(String(id)));
  lastNotificationTime = {}; // Reset notification timestamps for the new day/init
  console.log(`SW: Daily state initialized for ${todayServiceWorkerDateString}. Pending:`, Array.from(pendingSubmissionsForToday));
}

self.addEventListener('message', (event) => {
  const { type, data } = event.data;

  if (type === 'INIT_STATE') {
    console.log('SW: Received INIT_STATE', data);
    REMINDER_SLOTS_SW = data.reminderSlots;
    REPORT_TIME_SW = data.reportTime;
    APP_TITLE_SW = data.appTitle;
    NOTIFICATION_ICON_URL_SW = data.notificationIconUrl;
    NOTIFICATION_SOUND_URL_SW = data.notificationSoundUrl;
    NOTIFICATION_REPEAT_INTERVAL_SW = data.notificationRepeatInterval; // This will be 30 minutes now

    const allReminderIds = REMINDER_SLOTS_SW.map(slot => slot.id);
    // Ensure submissions are filtered for the *current* date string provided by the app
    const submittedTodayIds = data.submissions
      .filter(s => {
        const subDate = new Date(s.submittedAt);
        const subDateString = `${subDate.getFullYear()}-${(subDate.getMonth() + 1).toString().padStart(2, '0')}-${subDate.getDate().toString().padStart(2, '0')}`;
        return subDateString === data.currentDateString;
      })
      .map(s => s.reminderId);

    initializeDailyState(data.currentDateString, allReminderIds, submittedTodayIds);

    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(checkRemindersAndNotify, 60000); // Check every minute
    checkRemindersAndNotify(); // Perform an initial check immediately
  } else if (type === 'SUBMISSION_MADE') {
    console.log('SW: Received SUBMISSION_MADE', data);
    if (data.date === todayServiceWorkerDateString) {
      pendingSubmissionsForToday.delete(String(data.reminderId));
      delete lastNotificationTime[String(data.reminderId)]; // Stop further notifications for this slot today
      console.log(`SW: Submission for ${data.reminderId} on ${data.date} recorded. Pending:`, Array.from(pendingSubmissionsForToday));
      closeNotification(String(data.reminderId));
    }
  }
});

async function closeNotification(reminderIdTag) {
  if (!self.registration || typeof self.registration.getNotifications !== 'function') return;
  try {
    const notifications = await self.registration.getNotifications({ tag: reminderIdTag });
    notifications.forEach(notification => notification.close());
  } catch (error) {
    console.error("SW: Error closing notification:", error);
  }
}

function checkRemindersAndNotify() {
  const now = new Date();
  const currentSwDateString = getTodayDateStringSw();

  if (currentSwDateString !== todayServiceWorkerDateString) {
    console.log('SW: Date changed. Re-initializing daily state. App should send new INIT_STATE upon next load.');
    const allReminderIds = REMINDER_SLOTS_SW.map(slot => slot.id);
    initializeDailyState(currentSwDateString, allReminderIds, []); // Reset with no submissions for the new day
  }

  if (!REMINDER_SLOTS_SW || REMINDER_SLOTS_SW.length === 0) {
    // console.log('SW: Reminder slots not initialized yet or empty.');
    return;
  }

  // console.log('SW: Checking reminders at', now.toLocaleTimeString(), 'Pending:', Array.from(pendingSubmissionsForToday));

  REMINDER_SLOTS_SW.forEach(slot => {
    const slotIdStr = String(slot.id);
    if (pendingSubmissionsForToday.has(slotIdStr)) {
      const [slotHour, slotMinute] = slot.time.split(':').map(Number);
      
      // Use todayServiceWorkerDateString to construct slotTimeToday to avoid issues if checkRemindersAndNotify
      // runs exactly at midnight before todayServiceWorkerDateString is updated by the date change logic.
      const baseDateParts = todayServiceWorkerDateString.split('-').map(Number);
      const slotTimeToday = new Date(baseDateParts[0], baseDateParts[1] - 1, baseDateParts[2], slotHour, slotMinute);

      if (now >= slotTimeToday) { // Slot time has passed or is current for the SW's known "today"
        const timeSinceLastNotification = lastNotificationTime[slotIdStr] ? now.getTime() - lastNotificationTime[slotIdStr] : Infinity;

        if (timeSinceLastNotification >= NOTIFICATION_REPEAT_INTERVAL_SW) {
          if (self.Notification && self.Notification.permission === 'granted') {
            console.log(`SW: Triggering notification for ${slot.label} (ID: ${slotIdStr})`);
            const notificationOptions = {
              body: `"${slot.label}" için para yatırma zamanı! Lütfen durumu güncelleyin. Saat: ${slot.time}`,
              icon: NOTIFICATION_ICON_URL_SW,
              tag: slotIdStr, 
              renotify: true,
              vibrate: [200, 100, 200, 100, 200], // A more noticeable vibration
              // 'sound' is non-standard and support varies. Rely on default OS sound or vibrate.
              // sound: NOTIFICATION_SOUND_URL_SW, 
              // Adding data to identify the notification if needed on click
              data: { reminderId: slotIdStr, url: self.location.origin } 
            };
            self.registration.showNotification(`${APP_TITLE_SW} Hatırlatması`, notificationOptions)
              .then(() => {
                console.log(`SW: Notification shown for ${slotIdStr}`);
              })
              .catch(err => {
                console.error(`SW: Error showing notification for ${slotIdStr}:`, err);
              });
            lastNotificationTime[slotIdStr] = now.getTime();
          } else {
            console.log(`SW: Notification permission not granted for ${slot.label}. Cannot show notification.`);
            // If permission is denied, we might want to stop trying for this session or log it.
            // For now, it will just keep checking the time.
          }
        }
      }
    }
  });
}

// Handle notification click: focus or open the app
self.addEventListener('notificationclick', (event) => {
  console.log('SW: Notification clicked:', event.notification);
  event.notification.close();

  const targetUrl = event.notification.data && event.notification.data.url ? event.notification.data.url : '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (let i = 0; i < clientList.length; i++) {
        let client = clientList[i];
        // Check if the client URL matches the target and if it's focused
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      // If no existing window is found or can be focused, open a new one
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});