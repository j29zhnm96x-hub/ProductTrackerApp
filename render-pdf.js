async (page) => {
  const fs = await import('fs');
  const htmlPath = 'C:\\Users\\Korisnik\\Documents\\CodeProjects\\Lista za ulaz i otpis proizvoda na štandu\\deepseek-comparison.html';
  const html = fs.readFileSync(htmlPath, 'utf-8');
  await page.setContent(html, { waitUntil: 'networkidle0' });
  
  await page.pdf({
    path: 'C:\\Users\\Korisnik\\Documents\\DeepSeek models comparison.pdf',
    format: 'A4',
    printBackground: true,
    margin: { top: '0', bottom: '0', left: '0', right: '0' },
    displayHeaderFooter: false
  });
  
  return 'PDF saved successfully';
}
