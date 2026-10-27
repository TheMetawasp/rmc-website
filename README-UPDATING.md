# Updating the RMC Advocates website

Everything below is done on github.com in the `rmc-website` repository. The site republishes itself in a few minutes.

## Add a Kenya Gazette
Open the `inbox/gazette` folder → **Add file → Upload files** → drag in the PDF(s) → **Commit changes**.

## Publish an Insights article
Write it in Word (first line = title, using the Title or Heading 1 style; Heading 2 for sections).
Optionally start the file name with the date, e.g. `2026-11-03 My article.docx`.
Open the `inbox/articles` folder → **Add file → Upload files** → drag in the .docx → **Commit changes**.

## Check progress
The **Actions** tab shows each run. A green tick means the site is updated. A red cross means something failed:
open it to read why, or look for a `.ERROR.txt` file in the inbox folder.

## Remove or correct a Gazette notice (data protection requests)
Use `gazette-admin.html` on your computer ("Remove or correct a notice") and upload the files it produces.
