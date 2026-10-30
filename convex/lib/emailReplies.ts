export function replyDomain(): string | null {
  const domain = process.env.MESSAGE_REPLY_DOMAIN;
  return domain &&
    domain.length <= 189 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(
      domain,
    )
    ? domain
    : null;
}
export function repliesConfigured() {
  return !!(
    replyDomain() &&
    /^[a-f0-9]{64}$/.test(process.env.MESSAGE_REPLY_KEY ?? "") &&
    process.env.RESEND_RECEIVING_WEBHOOK_SECRET?.startsWith("whsec_") &&
    process.env.RESEND_API_KEY
  );
}
