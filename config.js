/* LabToolkit runtime configuration.
 *
 * Fill these in to switch on optional accounts + end-to-end-encrypted sync.
 * Leave them blank to run in fully local, no-account mode (the calculators and local
 * saving work either way). See SETUP.md for how to create the Supabase project and where
 * to find these values.
 *
 * The anon key is PUBLIC by design — it is safe to ship in the browser because every table
 * is protected by Row-Level Security, and saved content is encrypted on the device before
 * it is ever sent. Never put the Supabase *service_role* key here.
 */
window.LABTOOLKIT_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: '',
};
