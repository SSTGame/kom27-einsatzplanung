// Einstellungen – nach dem Supabase-Setup hier eintragen (siehe README.md).
// Solange supabaseUrl leer ist, läuft die Seite im DEMO-Modus (Daten nur im eigenen Browser).
window.KOM27_CONFIG = {
  supabaseUrl: 'https://jnwcmusamhijctwjyfbh.supabase.co',          // z. B. 'https://abcdxyz.supabase.co'
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impud2NtdXNhbWhpamN0d2p5ZmJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM3MDg0MjIsImV4cCI6MjEwOTI4NDQyMn0.fVnoVkj2YLf1e2VjsdqS8DBsXTTLv8JMTysAZEFhJuE',      // "anon public" Key aus Supabase → Project Settings → API
  appUrl: 'https://kom27-einsatzplanung.kom27.workers.dev/',             // Adresse dieser Seite, z. B. 'https://sstgame.github.io/kom27-einsatzplanung/'
  senderName: 'Basti',      // Name unter den Anfrage-Mails
  sharepointUrl: 'https://kom27-my.sharepoint.com/:x:/r/personal/jens_neumann-cornelius_kom27_de/_layouts/15/doc2.aspx?sourcedoc=%7BDC377344-F0DA-4CEA-ADBD-EE8F1B8943A1%7D&file=Medientechnik_KOM27_VA-Kalender%202026.xlsx&action=default&mobileredirect=true',
  demoAdmin: 'master@demo.de',
  // Angaben für die Datenschutzerklärung (Verantwortlicher). Leere Felder werden als „noch einzutragen“ angezeigt.
  legal: {
    name: 'Sebastian Hellfritz', // Name der verantwortlichen Person bzw. Firma
    zusatz: 'Privater Betrieb für interne Zwecke (Einsatzplanung KOM27)\n', // optional, z. B. Firmenzusatz, Vertreten durch …, Handelsregister
    email: 'basti.hellfritz@gmail.com'
  }
};
