
export enum ReminderId {
  MORNING = 'MORNING',
  AFTERNOON = 'AFTERNOON',
}

export enum DepositStatus {
  DEPOSITED = 'YATIRILDI',
  NOT_DEPOSITED = 'YATIRILMADI',
}

// Represents a configured reminder slot for the day
export interface ReminderSlot {
  id: ReminderId;
  label: string; // e.g., 'Sabah Hatırlatması'
  time: string; // HH:MM format, e.g., '11:00'
}

// Represents a specific submission made by the user
export interface Submission {
  id: string; // Unique ID for the submission, e.g., 'MORNING-2024-07-29' or a UUID
  reminderId: ReminderId;
  reminderLabel: string;
  storeName: string;
  status: DepositStatus;
  depositSlipFile?: File;
  depositSlipPreview?: string; // base64 string for image preview
  depositSlipFileName?: string;
  explanation?: string;
  submittedAt: Date;
}
