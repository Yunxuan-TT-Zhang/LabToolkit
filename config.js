/* TheLabToolkit runtime configuration.
 *
 * These switch on optional accounts + cross-device sync. Leaving them blank runs the app in
 * fully local, no-account mode (the calculators and local saving work either way). See
 * SETUP.md.
 *
 * The anon/publishable key is PUBLIC by design — it is safe to ship in the browser because
 * every table is protected by Row-Level Security, and saved content is encrypted on the
 * device before it is ever sent. Never put the Supabase *service_role* / *secret* key here.
 */
window.LABTOOLKIT_CONFIG = {
  supabaseUrl: 'https://lfgjtilokwzptmhjgcby.supabase.co',
  supabaseAnonKey: 'sb_publishable_wWtisweehD00xnJB4G71hQ_GqTztPgx',
};
