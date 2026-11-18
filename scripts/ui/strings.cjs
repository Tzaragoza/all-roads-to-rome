// Proofreading aid: every player-facing sentence in one file, in source order.
// Usage: node scripts/ui/strings.cjs > /tmp/strings.txt  (then read it top to bottom once)
const fs = require('fs');
const files = ['src/client/arlr/app.ts', 'src/client/arlr/tutorial.ts', 'src/client/splash.tsx', 'src/server/core/game.ts', 'src/server/core/post.ts'];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  console.log(`\n===== ${f}`);
  const re = /(['"`])((?:\\.|(?!\1)[^\\])*?)\1/g;
  let m;
  while ((m = re.exec(src))) {
    const text = m[2].replace(/<[^>]+>/g, ' ').replace(/\$\{[^}]*\}/g, '…').replace(/\s+/g, ' ').trim();
    if (text.split(' ').length >= 4 && /[a-z]/.test(text) && !/^[\w.-]+$/.test(text) && !/[{};=]|=>/.test(text)) console.log(`${src.slice(0, m.index).split('\n').length}: ${text}`);
  }
}
