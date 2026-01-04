import type { proto } from "baileys";

type ButtonV2Type = 'copy' | 'url' | 'buttons' | 'reminder' | 'webview';

interface BaseButtonV2 {
  type: ButtonV2Type;
  text: string;
}

interface UrlButtonV2 extends BaseButtonV2 {
  type: 'url';
  url: string;
}

interface CopyButtonV2 extends BaseButtonV2 {
  type: 'copy';
  copy_code: string;
}

interface ButtonsButtonV2 extends BaseButtonV2 {
  type: 'buttons';
  id: string;
}

interface ReminderButtonV2 extends BaseButtonV2 {
  type: 'reminder';
  id: string;
}

interface WebviewButtonV2 extends BaseButtonV2 {
  type: 'webview',
  url: string;
}

export type ButtonV2Params =
  | UrlButtonV2
  | CopyButtonV2
  | ButtonsButtonV2
  | ReminderButtonV2
  | WebviewButtonV2;

export interface BtnOptsV2Params {
  contextInfo?: Partial<proto.IContextInfo>;
  body: Partial<proto.Message.InteractiveMessage.Body>;
  header?: Partial<proto.Message.InteractiveMessage.Header>;
  footer?: Partial<proto.Message.InteractiveMessage.Footer>;
}

export interface ListV2Rows {
  header?: string;
  title: string;
  description?: string;
  id: string;
}

export interface ListV2Sections {
  title?: string,
  highlight_label?: string;
  rows: ListV2Rows[];
}

export interface ListV2 {
  title: string;
  sections: ListV2Sections[]
}

export interface MessageInfoLabels {
  value?: string;
  type?: string;
  placement?: string;
  source?: string;
}

export interface MessageParamsJson {
  bottom_sheet?: {
    in_thread_buttons_limit?: number;
    divider_indices?: any[];  
  };
  limited_time_offer?: {
    text?: string;
    url?: string;
    copy_code?: string;
    expiration_time?: number;
  };
  info_labes?: MessageInfoLabels[];
}

export interface BtnOptsV2ListParams {
  contextInfo?: Partial<proto.IContextInfo>;
  body: Partial<proto.Message.InteractiveMessage.Body>;
  header?: Partial<proto.Message.InteractiveMessage.Header>;
  footer?: Partial<proto.Message.InteractiveMessage.Footer>;
  messageParamsJson?: Partial<MessageParamsJson>;
}

export interface ButtonParams {
  id?: string;
  text?: string;
  displayText?: string;
  name?: string;
  buttonParamsJson?: string;
  buttonId?: string;
  buttonText?: {
    displayText: string;
  };
}

export interface ListRow {
  title?: string;
  description?: string;
  id?: string;
}

export interface ListSection {
  title?: string;
  rows: ListRow[];
}

export interface SendButtonOptions {
  footer?: string;
  title?: string;
  subtitle?: string;
  image?: Buffer | string | { url: string };
  video?: Buffer | string | { url: string };
  document?: Buffer | string | { url: string };
  useAI?: boolean;
  additionalNodes?: any[];
  additionalAttributes?: any;
  useCachedGroupMetadata?: boolean;
  statusJidList?: string[];
  [key: string]: any;
}

export interface SendListOptions {
  footer?: string;
  title?: string;
  [key: string]: any;
}

export interface InteractiveMessageContent {
  text?: string;
  caption?: string;
  footer?: string;
  title?: string;
  subtitle?: string;
  interactiveButtons?: ButtonParams[];
  image?: Buffer | string | { url: string };
  video?: Buffer | string | { url: string };
  document?: Buffer | string | { url: string };
  [key: string]: any;
}

export interface CarouselCard {
  header?: string;
  body?: string;
  footer?: string;
  image?: Buffer | string;
  buttons?: ButtonV2Params[];
}

export interface BtnOptsCarouselParams {
  contextInfo?: Partial<proto.IContextInfo>;
  body?: Partial<proto.Message.InteractiveMessage.Body>;
  header?: Partial<proto.Message.InteractiveMessage.Header>;
  footer?: Partial<proto.Message.InteractiveMessage.Footer>;
}