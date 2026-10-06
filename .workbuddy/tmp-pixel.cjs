const fs = require('fs');
const zlib = require('zlib');

const path = 'C:/Users/刘兆朋/.workbuddy/clipboard-images/clipboard-2026-10-06T08-18-41-215Z-ff39a2f8.png';
const buf = fs.readFileSync(path);

// parse PNG chunks
let pos = 8;
let width = 0, height = 0, bitDepth = 0, colorType = 0;
const idat = [];
while (pos < buf.length) {
  const len = buf.readUInt32BE(pos);
  const type = buf.toString('ascii', pos + 4, pos + 8);
  if (type === 'IHDR') {
    width = buf.readUInt32BE(pos + 8);
    height = buf.readUInt32BE(pos + 12);
    bitDepth = buf[pos + 16];
    colorType = buf[pos + 17];
  } else if (type === 'IDAT') {
    idat.push(buf.slice(pos + 8, pos + 8 + len));
  } else if (type === 'IEND') break;
  pos += 12 + len;
}
console.log('size', width, height, 'bitDepth', bitDepth, 'colorType', colorType);
const raw = zlib.inflateSync(Buffer.concat(idat));
const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
const stride = width * channels;
const out = Buffer.alloc(height * stride);
let rp = 0;
for (let y = 0; y < height; y++) {
  const filter = raw[rp++];
  const rowStart = y * stride;
  for (let x = 0; x < stride; x++) {
    const cur = raw[rp++];
    const left = x >= channels ? out[rowStart + x - channels] : 0;
    const up = y > 0 ? out[rowStart - stride + x] : 0;
    const ul = y > 0 && x >= channels ? out[rowStart - stride + x - channels] : 0;
    let val;
    switch (filter) {
      case 0: val = cur; break;
      case 1: val = cur + left; break;
      case 2: val = cur + up; break;
      case 3: val = cur + ((left + up) >> 1); break;
      case 4: {
        const p = left + up - ul;
        const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - ul);
        val = cur + (pa <= pb && pa <= pc ? left : pb <= pc ? up : ul);
        break;
      }
      default: val = cur;
    }
    out[rowStart + x] = val & 0xff;
  }
}
function px(x, y) {
  const i = y * stride + x * channels;
  return [out[i], out[i + 1], out[i + 2]];
}
function avg(x0, y0, x1, y1) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { const p = px(x, y); r += p[0]; g += p[1]; b += p[2]; n++; }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}
console.log('row1 left  (100-190,100-140):', avg(100, 100, 190, 140));
console.log('row1 right (240-820,100-140):', avg(240, 100, 820, 140));
console.log('row2 left  (100-190,240-290):', avg(100, 240, 190, 290));
console.log('row2 right (240-820,240-290):', avg(240, 240, 820, 290));
console.log('row3 left  (100-190,390-430):', avg(100, 390, 190, 430));
console.log('row3 right (240-820,390-430):', avg(240, 390, 820, 430));
// text-free samples
console.log('row1 left  noText (160-195,95-145):', avg(160, 95, 195, 145));
console.log('row1 right noText (270-500,95-145):', avg(270, 95, 500, 145));
console.log('row2 left  noText (160-195,235-300):', avg(160, 235, 195, 300));
console.log('row2 right noText (270-500,235-300):', avg(270, 235, 500, 300));
console.log('row3 left  noText (160-195,385-440):', avg(160, 385, 195, 440));
console.log('row3 right noText (270-500,385-440):', avg(270, 385, 500, 440));

// horizontal scan across row2 at y=270, and vertical scan at x=120
let line = [];
for (let x = 78; x <= 830; x += 6) line.push(x + ':' + px(x, 270)[0]);
console.log('ROW2 y=270:', line.join(' '));
line = [];
for (let y = 210; y <= 330; y += 4) line.push(y + ':' + px(120, y)[0]);
console.log('COL x=120:', line.join(' '));

// fine horizontal scan across row2 at several y values, every 2px
for (const yy of [240, 270, 300]) {
  const pts = [];
  for (let x = 80; x <= 260; x += 2) pts.push(px(x, yy)[0]);
  console.log('y=' + yy, pts.join(','));
}

// crop row2 region to a new png for visual inspection (x76-860, y200-335), scale x3 nearest
const cx0=76, cy0=200, cw=784, ch=135, S=3;
const crop = Buffer.alloc(cy0? 0 : 0); // noop
const pngChunks = [];
function crc32(buf){let c,t=[];for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}let crc=0xFFFFFFFF;for(const b of buf)crc=t[(crc^b)&0xFF]^(crc>>>8);return (crc^0xFFFFFFFF)>>>0;}
function chunk(type,data){const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(td));return Buffer.concat([len,td,crc]);}
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(cw*S,0);ihdr.writeUInt32BE(ch*S,4);ihdr[8]=8;ihdr[9]=2;
const rawRows=[];
for(let y=0;y<ch*S;y++){const sy=cy0+Math.floor(y/S);const row=Buffer.alloc(1+cw*S*3);row[0]=0;for(let x=0;x<cw*S;x++){const sx=cx0+Math.floor(x/S);const p=px(sx,sy);row[1+x*3]=p[0];row[2+x*3]=p[1];row[3+x*3]=p[2];}rawRows.push(row);}
const idat2=zlib.deflateSync(Buffer.concat(rawRows));
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',idat2),chunk('IEND',Buffer.alloc(0))]);
fs.writeFileSync('.workbuddy/tmp-crop.png',png);
console.log('crop saved');
