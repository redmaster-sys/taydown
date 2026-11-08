# TayDown PRO v1.0 — Yüksek Hızlı İndirme ve Medya Yöneticisi

**TayDown**, **%100 Türkçe**, **reklamsız**, **16-kanallı (parçalı) HTTP/HTTPS indirme** ve **YouTube & X (Twitter) medya yakalama** uygulamasıdır.

## Öne Çıkan Özellikler

1. **Etkileyici 3B / Neon Türkçe Komut Çubuğu:**
   - **URL Ekle**, **YouTube & X İndir**, **Devam Et**, **Duraklat**, **Tümünü Durdur**, **Sil**, **Tam. Temizle**, **Programla**, **Seçenekler** ve **TURBO AÇIK/KAPALI** kontrolleri.
2. **Gerçek YouTube & X (Twitter) Video, Ses ve Görsel İndirici:**
   - Yerel `.venv\Scripts\yt-dlp.exe` ve sistemdeki `ffmpeg.exe` ile entegredir.
   - `4K Ultra HD (2160p MP4)`, `1080p Full HD (MP4)`, `720p HD (MP4)`, `Sadece Ses (MP3 320kbps)` ve `Orijinal Görsel / Kare (PNG)` seçeneklerini destekler.
3. **16-Kanal Paralel (HTTP Range) İndirme Motoru:**
   - Doğrudan dosya bağlantılarında sunucunun `Accept-Ranges: bytes` desteğini kontrol eder, dosyayı 16 eşzamanlı parçaya (segment) bölerek indirir, birleştirir ve SHA-256 özetini doğrular.
4. **Kayıt Klasörü:**
   - İndirilen tüm dosyalar otomatik olarak kullanıcı klasörünüzdeki `Downloads\TayDown` klasörüne kaydedilir. Arayüzdeki **📁 Klasörü Aç** butonu Windows Gezgini'nde doğrudan dosyayı gösterir.

## Çalıştırma

### 1. Tek Tıkla Masaüstü Penceresi Modu (Önerilen)
`TayDown-Baslat.bat` dosyasına çift tıklayın. Arka plan motoru çalışır ve uygulama çerçevesiz masaüstü penceresi (`--app`) olarak açılır.

### 2. Terminal Üzerinden Başlatma
```powershell
cd TayDown
node server.cjs
```
Ardından tarayıcınızda `http://127.0.0.1:4280` adresini açın.

## Kurulum (Windows)

Gerekenler: [Node.js](https://nodejs.org), Python 3, [ffmpeg](https://ffmpeg.org) (PATH'te).

```powershell
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
```

Sonra `TayDown-Baslat.bat` ile başlatın. Uygulama yalnızca kendi bilgisayarınızda (`127.0.0.1:4280`) çalışır.

## Sorumluluk ve kullanım

TayDown kişisel kullanım için yerel bir araçtır; YouTube ve X indirmeleri [yt-dlp](https://github.com/yt-dlp/yt-dlp) ile yapılır.
Başkasına ait içerikleri indirirken ilgili platformun kullanım şartlarına ve telif haklarına uymak **kullanıcının sorumluluğundadır**.
İndirdiğiniz içerikleri izinsiz paylaşmayın, dağıtmayın ya da bu aracı herkese açık bir hizmet olarak sunmayın.
Yazılım "olduğu gibi" verilir, herhangi bir garanti içermez.
