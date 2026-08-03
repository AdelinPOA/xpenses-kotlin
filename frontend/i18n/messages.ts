import { type Locale } from "./config";
import en from "../messages/en.json";
import ro from "../messages/ro.json";

export type Messages = typeof en;

const messages: Record<Locale, Messages> = { en, ro };
export default messages;
