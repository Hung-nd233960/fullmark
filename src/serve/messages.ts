/**
 * The few strings the server module puts on a served page (the page's own catalogue is not in this bundle: the module
 * must stay small). `vi` has every key `en` has; a test holds the two together.
 */
export const serveMessages: Record<"en" | "vi", ServeMessages> = {
  en: {
    sent: "Results sent. You can close this tab.",
    failed: "Could not save the results. Use Download results to keep them.",
  },
  vi: {
    sent: "Đã gửi kết quả. Bạn có thể đóng thẻ này.",
    failed: "Không lưu được kết quả. Hãy dùng Tải kết quả về để giữ lại.",
  },
};

export type ServeMessages = { readonly sent: string; readonly failed: string };

/** The messages for a page's `lang`; anything but `vi` is English. */
export const serveMessagesFor = (lang: string): ServeMessages =>
  lang.toLowerCase().startsWith("vi") ? serveMessages.vi : serveMessages.en;
