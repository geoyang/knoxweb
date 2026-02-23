const PHONE_EMAIL_DOMAIN = 'phone.kizu.online';

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return email?.endsWith(`@${PHONE_EMAIL_DOMAIN}`) ?? false;
}

export function getDisplayIdentifier(
  email: string | null | undefined,
  phone?: string | null,
): string {
  if (phone) return phone;
  if (!email) return '';
  if (isPlaceholderEmail(email)) {
    return email.replace(`@${PHONE_EMAIL_DOMAIN}`, '');
  }
  return email;
}
