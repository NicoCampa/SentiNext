Optional PDF fonts

The web UI uses a system font stack (`system-ui`, `-apple-system`, etc.). On macOS this is SF Pro, which is not redistributable.

To make generated PDFs look more like the website, you can add a modern UI font here.

Default: Space Grotesk (free, OFL license)
- This repo includes `SpaceGrotesk-Variable.ttf` in this folder.

Alternative: Inter (free, OFL license)
- Add `Inter-Regular.ttf` and `Inter-SemiBold.ttf` to this folder: `backend/assets/fonts/`

SentiNext will automatically use them for PDFs. If they are missing, PDFs fall back to Helvetica.

Alternative:
- Put `Regular.ttf` and `Bold.ttf` in this folder to use a custom font.
