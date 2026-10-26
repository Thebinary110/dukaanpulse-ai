// Renders the deck's lucide icons to PNG. Dependencies (react, react-dom, sharp, react-icons) resolve through NODE_PATH.
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const sharp = require('sharp');
const lu = require('react-icons/lu');
const fs = require('fs');
const want = {
  ask: ['LuMessageSquareText', '4C8DFF'], search: ['LuSearch', '4C8DFF'], scale: ['LuScale', '4C8DFF'], check: ['LuShieldCheck', '34D399'],
  flask: ['LuFlaskConical', 'B4A0FC'], chart: ['LuChartLine', '4C8DFF'], bot: ['LuBot', '4C8DFF'], database: ['LuDatabase', '9AA4BD'],
  shield: ['LuShieldAlert', 'F5B544'], user: ['LuUserCheck', '34D399'], store: ['LuStore', '4C8DFF'], ban: ['LuBan', 'F87171'],
  layout: ['LuLayoutDashboard', '9AA4BD'], message: ['LuMessagesSquare', '9AA4BD'], target: ['LuTarget', '4C8DFF'], cpu: ['LuCpu', 'B4A0FC'],
  zap: ['LuZap', 'F5B544'], lock: ['LuLock', '34D399'], refresh: ['LuRefreshCw', '4C8DFF'], hash: ['LuHash', '4C8DFF'], clock: ['LuClock', '9AA4BD'],
};
(async () => {
  for (const [name, [comp, color]] of Object.entries(want)) {
    const C = lu[comp];
    if (!C) { console.log('missing', comp); continue; }
    const svg = renderToStaticMarkup(React.createElement(C, { color: '#' + color, size: 256, strokeWidth: 1.75 }));
    await sharp(Buffer.from(svg)).resize(256, 256).png().toFile(`icons/${name}.png`);
  }
  console.log('icons:', fs.readdirSync('icons').length);
})();
