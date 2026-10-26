# Faru komik

Website baca komik dengan Next.js App Router, React, TypeScript, Tailwind CSS, dan komponen Kumo. Katalog dan reader membaca data nyata dari Supabase. Pipeline Shinigami → JSON tervalidasi → Supabase berjalan terpisah dari request pengunjung.

## Menjalankan frontend

Gunakan Node.js 22+, jalankan `npm ci`, lalu isi `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` di `.env.local` sesuai `.env.example`.

```powershell
npm run dev
# http://localhost:3000

# Pemeriksaan dan mode produksi
npm run check
npm run build
npm start
```

Hentikan server `npm start` sebelum membangun ulang dalam folder yang sama, lalu jalankan lagi setelah build selesai. Ini mencegah proses revalidasi server lama menulis cache ke hasil build baru. Jika port 3000 terpakai, gunakan `npm start -- --port 3001`.

- `/`: beranda, pilihan rating tinggi, update terbaru, dan komik dengan halaman baca tersedia.
- `/jelajahi`: pencarian judul, filter jenis/genre, urutan, dan paginasi.
- `/komik/[slug]`: metadata, sinopsis, daftar chapter, dan rekomendasi terkait.
- `/baca/[id]`: gambar berurutan, navigasi chapter, pilihan latar gelap, dan lebar baca desktop.
- `/koleksi`: bookmark dan riwayat di localStorage browser; belum ada sinkronisasi akun/perangkat.

Query katalog dijalankan di Server Components dengan publishable key dan RLS baca publik. Modul database ditandai `server-only`; secret key hanya untuk importer dan worker cloud. Fetch data memakai revalidasi 60 detik. Cover memakai Next.js Image dengan `unoptimized`: browser mengambil URL sumber langsung karena host gambar menolak optimizer Vercel. Ukuran cover tetap diatur oleh layout dan gambar di luar layar memakai lazy loading. Gambar chapter juga memakai URL sumber langsung, tanpa mengunduh atau menyimpan ulang gambar di Supabase Storage.

Worker cloud menulis langsung ke Supabase, terpisah dari arsip lokal. Metadata atau chapter yang sudah ada belum tentu memiliki manifest gambar. Reader menampilkan kondisi kosong yang jelas dan tautan sumber ketika halaman belum tersedia. Arsip lokal lama hanya masuk ke database melalui import snapshot manual.

## Deploy ke Vercel

Website produksi: [farucomics.vercel.app](https://farucomics.vercel.app/). Deploy melalui integrasi GitHub Vercel, preset Next.js, Node.js 22+ (produksi saat ini 24.x), dan build command `npm run build`. Tidak memerlukan Vercel CLI. Build memerlukan akses ke Supabase dan Google Fonts.

Atur environment **Production** melalui dashboard Vercel:

| Variabel                               | Kegunaan                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | URL proyek untuk frontend                                                               |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Key publik dengan RLS baca katalog                                                      |
| `SUPABASE_URL`                         | URL proyek untuk worker; boleh sama dengan URL publik                                   |
| `SUPABASE_SERVICE_ROLE_KEY`            | Key server Supabase (`sb_secret_…` atau legacy service role); simpan sebagai Sensitive  |
| `CRON_SECRET`                          | Secret acak minimal 32 karakter untuk Cron dan kontrol worker; simpan sebagai Sensitive |
| `SCRAPER_DATABASE_LIMIT_MB`            | Batas ukuran seluruh database sebelum worker berhenti; default `400`                    |

Jangan beri awalan `NEXT_PUBLIC_` pada key server atau secret Cron. Aktifkan **Automatically expose System Environment Variables** pada pengaturan proyek agar Workflow mendapat identitas deployment. Setelah mengubah environment, deploy ulang. Jalankan kedua migration SQL sebelum memulai worker; lihat bagian Supabase di bawah.

## Scraping di Vercel

Vercel Workflow menjalankan pekerjaan bertahap dan menyimpan checkpoint di tabel privat `scrape_jobs` di Supabase. Tidak ada scraping pada build atau request pembaca. Menjalankan frontend lokal juga tidak memulai worker. Komputer boleh dimatikan setelah pekerjaan dimulai di deployment produksi.

Urutan pengambilan adalah discovery seluruh katalog, pelengkapan daftar chapter, lalu URL gambar seluruh chapter yang belum memiliki manifest. Worker memproses request sumber berurutan dengan jeda 1,5 detik. Setiap halaman katalog, halaman daftar chapter, dan manifest chapter dikomit atomik bersama checkpoint; upsert dan lease mencegah duplikasi atau dua worker menulis bersamaan. Satu batch mengambil satu halaman katalog (maksimal 100 judul), 5 halaman daftar chapter, atau 40 manifest; Workflow berikutnya melanjutkan checkpoint setelah 100 batch.

Pola service dan normalisasi diadaptasi dari referensi lokal Komiku-Rest-Api, tetapi sumber tetap Shinigami. Konfigurasi origin, referer, bahasa, identitas bot, dan host gambar berada di `src/scraper/source.ts`. Request tidak menyamar sebagai browser dan tidak membawa cookie atau kredensial sumber. Reader membuang nama file gambar yang berulang dengan tetap menjaga urutan halaman.

Checkpoint katalog menyimpan format, arah urutan, nomor halaman berikutnya, jumlah yang diharapkan, dan ID yang sudah ditemukan di Supabase. Setelah kegagalan, worker mengulang halaman yang gagal, bukan seluruh katalog. Jumlah unik tetap diverifikasi terhadap facet sebelum beralih ke daftar chapter; hasil parsial tidak ditandai lengkap. Checkpoint lama `{ "phase": "catalog" }` tetap didukung dan tidak memerlukan migration baru.

Worker mengakses `api.shngm.io` dan memeriksa `robots.txt` pada origin API tersebut. Tidak ada crawl halaman HTML `11.shinigami.asia`; kegagalan host website tidak dipakai untuk menyimpulkan akses API. Sesuai RFC 9309, respons 4xx pada `robots.txt` berarti aturan tidak tersedia; 429 tetap menghentikan setelah retry dan error server/jaringan tidak mengizinkan pengambilan data. Respons 401/403 pada endpoint data, challenge, dan aturan `Disallow` tetap menghentikan worker.

`vercel.json` menjadwalkan Cron harian pukul **08.00 WIB** (`0 1 * * *`, UTC; waktu eksekusi Hobby bisa bergeser). Cron memulai scan atau memulihkan Workflow yang berakhir sebelum antrean selesai. Ketika scan lengkap, scan harian berikutnya memeriksa pembaruan katalog. Job yang dijeda atau diblokir tidak dimulai ulang otomatis oleh Cron.

API kontrol hanya menerima `Authorization: Bearer <CRON_SECRET>`:

| Request                                              | Tindakan                                                               |
| ---------------------------------------------------- | ---------------------------------------------------------------------- |
| `GET /api/scraper`                                   | Status, fase, checkpoint, dan kegagalan terakhir                       |
| `GET /api/scraper/diagnostics`                       | Bukti transport dari satu request API, tanpa payload komik atau cookie |
| `POST /api/scraper` dengan JSON `{"action":"start"}` | Memulai atau melanjutkan checkpoint; tidak menggandakan run aktif      |
| `POST /api/scraper` dengan JSON `{"action":"pause"}` | Menjeda dan mencabut lease penulisan worker aktif                      |
| `GET /api/cron/scrape`                               | Endpoint Cron Vercel; secret yang sama                                 |

Gunakan HTTPS produksi untuk kontrol. Jangan memasukkan secret ke query string, source Git, atau browser publik. Respons tanpa secret adalah `401`.

Jika diagnostik mengembalikan `edge_access_denied` dan `server: cloudflare`, request ditolak pada lapisan akses sumber. Perubahan parser atau checkpoint tidak membuka akses tersebut. Pada uji 26 Oktober 2026, native fetch dan klien TLS/HTTP kompatibel sama-sama ditolak dengan 403 dari region Seoul dan Singapura. Worker tetap diblokir agar tidak mengulang request yang ditolak. Pengambilan baru membutuhkan akses API yang diizinkan oleh Shinigami; region produksi dikembalikan ke Seoul dan dependensi eksperimen dihapus.

401/403, challenge, atau larangan robots dari sumber memblokir job. Tiga kegagalan unit beruntun menjedanya; checkpoint sukses tetap tersimpan. Batas database juga menjeda job sebelum penyimpanan habis. Selesaikan penyebabnya sebelum melanjutkan secara manual. Jika daftar chapter sumber berubah di tengah paginasi dan hitungan tidak cocok, worker berhenti dengan error, bukan menandai daftar parsial sebagai lengkap.

Seluruh URL gambar bisa membutuhkan ruang database dan kuota Workflow/Functions yang besar. Batas 400 MB tidak menjamin semua manifest muat pada paket gratis; tidak ada peningkatan paket otomatis. Kolom `source_requests` menghitung unit pengambilan yang telah dikomit, bukan seluruh request HTTP termasuk robots dan retry. File gambar tidak diunduh.

## CLI lokal opsional (tidak dijalankan otomatis)

Scraping lokal **dinonaktifkan secara default**. `npm run scrape` dan `npm run scrape:all` berhenti sebelum membuat file atau menghubungi sumber. Gunakan kontrol worker Vercel untuk pengambilan data normal. Contoh CLI di bawah hanya untuk pengembangan yang sengaja diaktifkan dengan `ALLOW_LOCAL_SCRAPING=true`; jangan mengaktifkannya jika data harus tetap berada di cloud.

Gunakan Node.js 22+.

```powershell
npm install
npm run scrape
```

Default mengambil **5 judul**, daftar chapter sampai 20 halaman API per judul (50 chapter per halaman), dan **referensi gambar chapter pertama** setiap judul. Hasil disimpan di `data/shinigami.json` yang diabaikan Git. Tidak mengunduh file gambar.

```powershell
# Validasi dataset tanpa koneksi database
npm run import:supabase -- --dry-run

# Perbesar sampel; komik yang sudah ada otomatis dilewati
npm run scrape -- --max-comics 20 --catalog-pages 3

# Ambil ulang satu judul dan referensi untuk 10 chapter pertamanya
npm run scrape -- --comic-id UUID-DARI-SUMBER --reader-chapters 10 --refresh

# Metadata + daftar chapter saja
npm run scrape -- --reader-chapters 0 --output data/catalog.json

npm run scrape -- --help
npm run check
```

`--max-comics` membatasi judul yang dicoba **per eksekusi**, termasuk yang gagal. `--reader-chapters` menghitung N chapter paling awal, bukan N chapter tambahan. Untuk melengkapi gambar semua chapter suatu judul, set angka setidaknya sebesar jumlah chapternya dan gunakan `--refresh`. `--chapter-pages` membatasi halaman daftar chapter; hasil parsial ditandai `chapter_list_complete: false`.

Satu checkpoint ditulis atomik setelah satu komik berhasil diproses. Eksekusi ulang melewati judul yang sudah tersimpan, kecuali memakai `--refresh`. Refresh parsial mempertahankan chapter dan referensi halaman yang sudah terkumpul. Jangan jalankan dua proses dengan path output yang sama. Gagal per judul dilaporkan dengan exit code 1; checkpoint judul yang berhasil tetap tersimpan. Untuk melanjutkan katalog besar, tambah `--catalog-pages` agar melewati halaman yang sudah selesai. Urutan sumber dapat berubah saat judul diperbarui; deduplikasi memakai ID sumber.

## Pengambilan seluruh katalog dan seluruh URL gambar

```powershell
# Semua tahap: katalog, daftar chapter seluruh judul, URL gambar seluruh chapter
npm run scrape:all

# Cek katalog saja atau daftar chapter saja
npm run scrape:all -- --phase catalog
npm run scrape:all -- --phase chapters

# Jalankan ulang perintah yang sama untuk melanjutkan checkpoint
npm run scrape:all

# Validasi/import arsip lengkap tanpa menggabungkan semuanya ke satu file besar
npm run import:supabase -- --directory data/shinigami-full --dry-run
npm run import:supabase -- --directory data/shinigami-full
```

Arsip lengkap disimpan terpisah dari sampel:

- `data/shinigami-full/catalog.json`: metadata semua judul yang ditemukan.
- `data/shinigami-full/catalog-report.json`: jumlah format menurut sumber, jumlah ID unik yang ditemukan, dan apakah keduanya cocok.
- `data/shinigami-full/comics/{id}.json`: daftar chapter; disimpan setelah setiap halaman API.
- `data/shinigami-full/chapters/{id}.json`: referensi halaman baca; disimpan setelah **setiap chapter**.
- `data/shinigami-full/progress.json`: status proses, PID, jumlah chapter/referensi, dan judul aktif.
- `data/shinigami-full/failures.jsonl`: kegagalan yang perlu diulang.

Endpoint katalog membatasi hitungan hasil ke 1.000, sedangkan facet format pada pemeriksaan 23 Oktober 2026 menyebutkan 1.575 judul. Discovery menggunakan filter format dan urutan terbaru/terlama yang tersedia di endpoint, menggabungkan ID unik, lalu memverifikasi jumlahnya terhadap facet. Jika jumlahnya tidak cocok, proses melaporkan katalog belum lengkap. Pembaruan sumber selama scan masih dapat mengubah hitungan; jalankan dengan `--refresh-catalog` untuk melakukan discovery ulang.

Semua chapter yang belum memiliki manifest masuk antrean, tanpa batas sampel. Request tetap berurutan dan memakai jeda. Ribuan atau puluhan ribu chapter membutuhkan waktu lama; waktu minimum di progress hanya menghitung jeda request, belum jaringan/retry. Saat dihentikan, jalankan ulang perintah yang sama untuk melanjutkan dari checkpoint. Hanya satu worker diizinkan per direktori. Tiga kegagalan unit beruntun menghentikan worker; 401/403, robots denial, challenge, atau cooldown panjang menghentikannya langsung. Tidak ada pengelakan kontrol akses.

Bagian CLI ini mendokumentasikan pipeline lokal lama. Jika dijalankan manual, komputer harus tetap menyala dan terkoneksi; arsip tersebut terpisah dari checkpoint cloud. Jangan menjalankan pipeline lokal untuk melanjutkan job Vercel. Jangan jalankan importer saat proses scraping masih mengubah arsip jika kamu membutuhkan satu snapshot konsisten untuk publikasi.

## Menghubungkan Supabase

1. Buat proyek Supabase.
2. Jalankan migration `supabase/migrations/202610230001_catalog.sql`, lalu `supabase/migrations/20261024034453_cloud_scraper.sql` melalui SQL Editor. Migration hanya dijalankan sekali; pada proyek Supabase yang sudah dikonfigurasi, periksa riwayat migration sebelum menjalankannya kembali.
3. Salin `.env.example` menjadi `.env.local`; isi `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY`.
4. Jalankan `npm run import:supabase`.

Service role key hanya dipakai importer dan worker server. Jangan masukkan ke bundle browser atau variabel berawalan `NEXT_PUBLIC_`. Import snapshot lokal pada langkah 4 bersifat opsional ketika memakai worker cloud.

Import memakai RPC `import_comic_bundle`: satu komik + chapter + halaman masuk dalam satu transaksi. ID deterministik dan upsert mencegah duplikasi saat diulang. Import checkpoint yang lebih lama tidak menimpa data lebih baru. Daftar chapter parsial tidak menghapus data lama; manifest gambar hanya diganti jika data chapter tersebut berhasil diambil. Tidak ada penghapusan komik otomatis ketika suatu judul menghilang dari katalog sumber.

Tabel:

| Tabel           | Isi                                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------------------- |
| `comics`        | Judul, slug, sinopsis, cover, format, genre, penulis, status mentah sumber, waktu sinkronisasi       |
| `chapters`      | Relasi komik, nomor desimal, ID sumber, tanggal rilis, status pengambilan halaman                    |
| `chapter_pages` | URL gambar dan posisi baca berurutan                                                                 |
| `scrape_jobs`   | Checkpoint cloud, status, lease, identitas Workflow, dan kegagalan terakhir; akses service role saja |

RLS aktif: pengunjung dapat membaca katalog; tulis tabel dan RPC hanya diberikan kepada service role. Genre, penulis, dan artis berupa array karena tahap ini hanya membutuhkan filter dan tampilan metadata. Kode status sumber disimpan apa adanya; belum diterjemahkan menjadi ongoing/completed tanpa verifikasi pemetaan sumber.

## Perilaku sumber

Endpoint publik yang ditemukan dari aplikasi Shinigami:

- `https://api.shngm.io/v1/manga/list`
- `https://api.shngm.io/v1/manga/detail/{manga_id}`
- `https://api.shngm.io/v1/chapter/{manga_id}/list`
- `https://api.shngm.io/v1/chapter/detail/{chapter_id}`

Scraper memeriksa `robots.txt`, memakai identitas bot, request berurutan, jeda minimal 1 detik (default 1,5 detik), timeout, dan retry terbatas untuk kegagalan jaringan/429/5xx. 401, 403, challenge HTML, dan larangan robots menghentikan proses. Redirect tidak diikuti otomatis. Pada pemeriksaan awal, robots.txt website dan API mengembalikan 404; ini dicatat, bukan dianggap sebagai izin publikasi ulang.

URL gambar tetap bergantung pada server sumber dan mungkin berubah atau menolak hotlink. Checkpoint menyimpan referensi, bukan salinan gambar. Pengambilan referensi belum membuktikan gambar dapat ditampilkan dari domain website baru. Kelayakan publikasi konten perlu dibereskan sebelum situs dipublikasikan.

## Arsitektur deployment

Website Next.js membaca Supabase, sedangkan Workflow Vercel mengambil data secara bertahap di region `icn1`, dekat proyek Supabase Seoul. Setiap langkah berdurasi terbatas; state dan checkpoint berada di Supabase sehingga proses panjang tidak bergantung pada satu request HTTP. Route kontrol hanya meluncurkan Workflow, dan Cron harian melakukan pemulihan atau scan berikutnya. Integrasi GitHub Vercel menangani deploy dari Git.

Pengujian otomatis memakai fixture tanpa scraping sumber: parser, paginasi, penolakan akses, retry, bearer authorization, checkpoint cloud, lease/fencing, rollback transaksi, dan penolakan akses publik ke job menggunakan PostgreSQL lokal PGlite. Frontend sebelumnya diverifikasi terhadap Supabase di browser desktop dan mobile; perubahan worker tidak mengubah komponen UI. Hasil build dan tes tidak membuktikan akses jaringan dari Vercel ke sumber: periksa run produksi dan checkpoint setelah environment terpasang.
