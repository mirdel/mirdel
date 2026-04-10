/**
 * 将 window.open(url, '_blank') 的 http(s) 链接统一转到 webPreview 窗口
 * 影响：主窗口、轻应用窗口中的 markdown 链接、EditorLinkPopover 等
 */
const _open = window.open;
window.open = function (
  url?: string | URL,
  target?: string,
  features?: string
): Window | null {
  const urlStr = url != null ? (typeof url === "string" ? url : url.href) : "";
  if (
    urlStr &&
    /^https?:\/\//i.test(urlStr) &&
    (target === "_blank" || target === undefined || target === null)
  ) {
    (window as typeof window & { webPreview?: { open: (u: string) => void } }).webPreview?.open(
      urlStr
    );
    return null;
  }
  return _open.call(this, url, target, features);
};
