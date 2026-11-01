import type React from 'react';
import type { AccessibilityActionEvent, AccessibilityActionInfo } from 'react-native';

/** What every card gets from the message it's in. */
export type CardProps<T> = {
  data: T;
  /** You sent it */
  mine: boolean;
  /** The last of a run: the bubble's tail corner */
  tail: boolean;
  /** The time, and your ticks */
  footer: React.ReactNode;
  senderId: string | null;
  /** Still in the outbox: its buttons wait until it's sent */
  pending: boolean;
  /** The saved message (null while it's in the outbox) */
  messageId: number | null;
  conversationId: number;
  votes: Record<string, string[]> | null;
  /** Who sent it and when, for screen readers ("Rafi Ahmed, 9:58 AM: ") */
  labelPrefix: string;
  /** For test ids: the message id, or the outbox id while it's sending */
  testKey: string;
  /** The message's menu and Reply, for screen readers (on the card's heading) */
  a11yActions?: AccessibilityActionInfo[];
  onA11yAction?: (e: AccessibilityActionEvent) => void;
};
