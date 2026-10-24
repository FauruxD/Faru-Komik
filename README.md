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

Query katalog dijalankan di Server Components dengan publishable key dan RLS baca publik. Modul database ditandai `server-only`; secret key hanya untuk importer. Fetch data memakai revalidasi 60 detik. Cover menggunakan optimasi gambar Next.js; gambar chapter memakai URL sumber secara langsung dengan lazy loading, tanpa mengunduh atau menyimpan ulang gambar di Supabase Storage.

Dataset lokal dan database tidak tersinkron otomatis. Metadata atau chapter yang sudah ada belum tentu memiliki manifest gambar. Reader menampilkan kondisi kosong yang jelas dan tautan sumber ketika halaman belum tersedia. Jalankan import snapshot untuk memperbarui database setelah scraping dilanjutkan.

## Deploy ke Vercel

Impor repository ke Vercel menggunakan preset Next.js, Node.js 22+, build command `npm run build`. Tambahkan **hanya** `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` untuk frontend. Jangan tambahkan secret importer ke variabel publik. Build memerlukan akses ke Supabase dan Google Fonts. Setelah mengganti environment variables, lakukan deploy ulang.

Tidak ada scheduler scraper di Vercel. CLI scraping tetap berjalan di komputer/worker terpisah dan melanjutkan checkpoint setelah dijalankan ulang. Proyek belum dipublikasikan ke Vercel.

## Mulai

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

Pada Windows, worker background yang diluncurkan Sol menulis `worker.log` dan `worker.error.log` dalam direktori tersebut. Komputer harus tetap menyala dan terkoneksi; worker ini belum merupakan job cloud. Jangan jalankan importer saat proses scraping masih mengubah arsip jika kamu membutuhkan satu snapshot konsisten untuk publikasi.

## Menghubungkan Supabase

1. Buat proyek Supabase.
2. Jalankan isi `supabase/migrations/202610230001_catalog.sql` melalui SQL Editor, atau pakai Supabase CLI dan `supabase db push` setelah proyek ditautkan.
3. Salin `.env.example` menjadi `.env.local`; isi `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY`.
4. Jalankan `npm run import:supabase`.

Service role key hanya dipakai proses import di server/lokal. Jangan masukkan ke bundle browser atau variabel berawalan `NEXT_PUBLIC_`.

Import memakai RPC `import_comic_bundle`: satu komik + chapter + halaman masuk dalam satu transaksi. ID deterministik dan upsert mencegah duplikasi saat diulang. Import checkpoint yang lebih lama tidak menimpa data lebih baru. Daftar chapter parsial tidak menghapus data lama; manifest gambar hanya diganti jika data chapter tersebut berhasil diambil. Tidak ada penghapusan komik otomatis ketika suatu judul menghilang dari katalog sumber.

Tabel:

| Tabel           | Isi                                                                                            |
| --------------- | ---------------------------------------------------------------------------------------------- |
| `comics`        | Judul, slug, sinopsis, cover, format, genre, penulis, status mentah sumber, waktu sinkronisasi |
| `chapters`      | Relasi komik, nomor desimal, ID sumber, tanggal rilis, status pengambilan halaman              |
| `chapter_pages` | URL gambar dan posisi baca berurutan                                                           |

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

Scraper berjalan sebagai CLI di luar request pembaca. Website Next.js membaca Supabase, sehingga setiap pengunjung tidak memicu request scraping dan proses panjang tidak bergantung pada batas waktu fungsi Vercel. Tidak ada scheduler atau deploy otomatis pada tahap ini.

Pengujian otomatis mencakup parser, paginasi, penolakan akses, retry, dan skema/RPC PostgreSQL lokal menggunakan PGlite. Frontend diverifikasi di browser terhadap proyek Supabase yang dikonfigurasi, dengan screenshot dan laporan viewport lokal di `data/frontend-qa/` (diabaikan Git).
