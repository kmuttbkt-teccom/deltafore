'use strict';
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'data', 'codes.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const now = new Date().toISOString();

const newCodes = {
  "surprise": {
    "code": "surprise",
    "status": "new",
    "source": "จีน CN · 官方口令码",
    "addedAt": now,
    "tries": 0,
    "seen": ["จีน CN · 官方口令码", "Bilibili · 直播"],
    "note": "[สกินปืน] [จีน CN] สกินปืน K437 ในตำนาน \"霸气外露\" (แลกในเกม: กิจกรรม -> อื่นๆ -> 口令兑换)"
  },
  "SJZ2026": {
    "code": "SJZ2026",
    "status": "new",
    "source": "จีน CN · 官方口令码",
    "addedAt": now,
    "tries": 0,
    "seen": ["จีน CN · 官方口令码", "TapTap"],
    "note": "[สกินปืน] [จีน CN] กล่องเลือกสกินปืนสีแดง (红色枪皮自选箱) + เสบียงรบ"
  },
  "bilibili666": {
    "code": "bilibili666",
    "status": "new",
    "source": "จีน CN · Bilibili",
    "addedAt": now,
    "tries": 0,
    "seen": ["จีน CN · Bilibili", "官方活动"],
    "note": "[สกินปืน] [จีน CN] สกินปืน Dark Night Warrior (暗夜武士) + ตั๋วกล่องสุ่ม"
  },
  "DX202402": {
    "code": "DX202402",
    "status": "new",
    "source": "จีน CN · 官方兑换码",
    "addedAt": now,
    "tries": 0,
    "seen": ["จีน CN · 官方兑换码", "Baidu"],
    "note": "[ตัวละคร] [จีน CN] บัตรทดลองตัวละคร Operator (干员体验卡) + วัตถุดิบอัปเกรด"
  },
  "DX202401": {
    "code": "DX202401",
    "status": "new",
    "source": "จีน CN · 官方兑换码",
    "addedAt": now,
    "tries": 0,
    "seen": ["จีน CN · 官方兑换码", "Baidu"],
    "note": "[จีน CN] 1,000 เหรียญทอง + ชุดเกราะเริ่มต้นครบเซ็ต"
  },
  "DF0922": {
    "code": "DF0922",
    "status": "new",
    "source": "จีน CN · 官方口令码",
    "addedAt": now,
    "tries": 0,
    "seen": ["จีน CN · 官方口令码", "TapTap", "Global · pockettactics"],
    "note": "[ตัวละคร] [จีน CN] อวาตาร์พิเศษตัวละคร Vyron (威龙) สีม่วง + เสบียงเปิดเซิร์ฟ"
  },
  "DFHAWK": {
    "code": "DFHAWK",
    "status": "new",
    "source": "Global · timesaver.gg",
    "addedAt": now,
    "tries": 0,
    "seen": ["Global · timesaver.gg", "Global · gamsgo"],
    "note": "[ตัวละคร] [Global] กรอบรูปตัวละคร Operator Hawk + กล่องแต่งปืนขั้นสูง"
  },
  "DELTAFORCE2026": {
    "code": "DELTAFORCE2026",
    "status": "new",
    "source": "Global · timesaver.gg",
    "addedAt": now,
    "tries": 0,
    "seen": ["Global · timesaver.gg", "Global · gamsgo"],
    "note": "[สกินปืน] [Global] บัตรทดลองสกินปืน M4A1 ลายพิเศษ + บัตรเกราะยุทธวิธี + EXP x2"
  },
  "PTR-32": {
    "code": "PTR-32",
    "status": "new",
    "source": "Global · timesaver.gg",
    "addedAt": now,
    "tries": 0,
    "seen": ["Global · timesaver.gg", "Global · pockettactics"],
    "note": "[อาวุธ] [Global] เสบียงอุปกรณ์ปืน PTR-32 และยุทธวิธี"
  },
  "DFS10START": {
    "code": "DFS10START",
    "status": "new",
    "source": "จีน CN · 官方口令码",
    "addedAt": now,
    "tries": 0,
    "seen": ["จีน CN · 官方口令码", "好游快爆"],
    "note": "[เสบียง] [จีน CN] 50,000 Hafe Coins + ตั๋ว Delta (三角券) 50 ใบ"
  },
  "AIRDROP2026": {
    "code": "AIRDROP2026",
    "status": "new",
    "source": "จีน CN · 官方口令码",
    "addedAt": now,
    "tries": 0,
    "seen": ["จีน CN · 官方口令码", "好游快爆"],
    "note": "[เสบียง] [จีน CN] เหรียญ Hafe + สารปรับเสถียรภาพรังสี (Radiation Stabilizer)"
  },
  "SUMMERDELTA": {
    "code": "SUMMERDELTA",
    "status": "new",
    "source": "จีน CN · 官方口令码",
    "addedAt": now,
    "tries": 0,
    "seen": ["จีน CN · 官方口令码", "好游快爆"],
    "note": "[เสบียงแรร์] [จีน CN] ตั๋ว Delta + อิฐแมนเดล (Mandel Brick ถอดรหัสลุ้นสกินปืนทอง)"
  },
  "DELTA666": {
    "code": "DELTA666",
    "status": "new",
    "source": "จีน CN · 官方口令码",
    "addedAt": now,
    "tries": 0,
    "seen": ["จีน CN · 官方口令码", "Baidu"],
    "note": "[เสบียง] [จีน CN] กล่องเสบียงอาวุธ + เหรียญ Hafe"
  },
  "DELTA888": {
    "code": "DELTA888",
    "status": "new",
    "source": "จีน CN · 官方口令码",
    "addedAt": now,
    "tries": 0,
    "seen": ["จีน CN · 官方口令码", "Baidu"],
    "note": "[เสบียง] [จีน CN] กล่องเสบียงยุทธวิธี + เหรียญ Hafe"
  },
  "DELTA999": {
    "code": "DELTA999",
    "status": "new",
    "source": "จีน CN · 官方口令码",
    "addedAt": now,
    "tries": 0,
    "seen": ["จีน CN · 官方口令码", "Baidu"],
    "note": "[เสบียง] [จีน CN] กล่องพยาบาลขั้นสูง + อุปกรณ์เสริมแต่งปืน"
  },
  "VIP777": {
    "code": "VIP777",
    "status": "new",
    "source": "จีน CN · 官方口令码",
    "addedAt": now,
    "tries": 0,
    "seen": ["จีน CN · 官方口令码", "Baidu"],
    "note": "[เสบียง] [จีน CN] เสบียงรบ + บัตร EXP อาวุธ 2 เท่า"
  },
  "VIP888": {
    "code": "VIP888",
    "status": "new",
    "source": "จีน CN · 官方口令码",
    "addedAt": now,
    "tries": 0,
    "seen": ["จีน CN · 官方口令码", "Baidu"],
    "note": "[เสบียง] [จีน CN] เสบียงรบ + ชุดเกราะยุทธวิธี"
  },
  "VIP999": {
    "code": "VIP999",
    "status": "new",
    "source": "จีน CN · 官方口令码",
    "addedAt": now,
    "tries": 0,
    "seen": ["จีน CN · 官方口令码", "Baidu"],
    "note": "[เสบียง] [จีน CN] กล่องชิ้นส่วนดัดแปลงอาวุธขั้นสูง"
  },
  "DELTA2026": {
    "code": "DELTA2026",
    "status": "new",
    "source": "จีน CN · 官方口令码",
    "addedAt": now,
    "tries": 0,
    "seen": ["จีน CN · 官方口令码", "Baidu"],
    "note": "[สกินปืน] [จีน CN] เสบียงเริ่มต้น + ตั๋วสกินอาวุธ"
  },
  "WELCOME2026": {
    "code": "WELCOME2026",
    "status": "new",
    "source": "จีน CN · 官方口令码",
    "addedAt": now,
    "tries": 0,
    "seen": ["จีน CN · 官方口令码", "Baidu"],
    "note": "[เสบียง] [จีน CN] เสบียงต้อนรับผู้เล่นใหม่"
  },
  "DF202607": {
    "code": "DF202607",
    "status": "new",
    "source": "จีน CN · 官方口令码",
    "addedAt": now,
    "tries": 0,
    "seen": ["จีน CN · 官方口令码", "Baidu"],
    "note": "[เสบียง] [จีน CN] เสบียงซีซั่น + เหรียญ Hafe"
  }
};

const garenaNotes = {
  "DFARMX46": "[อาวุธ] [Garena] ตั๋วชิ้นส่วนอาวุธและอุปกรณ์ยุทธวิธี",
  "DFRainbow356": "[เสบียง] [Garena] กล่องเสบียงพิเศษ Rainbow",
  "DFclover812": "[เสบียง] [Garena] กล่องเสบียงโชคดี Clover",
  "DFEnergy428": "[เสบียง] [Garena] กล่องเครื่องดื่มชูกำลัง Energy Pack",
  "DFMagic057": "[เสบียง] [Garena] กล่องเสบียง Magic Crate",
  "DFWizard309": "[เสบียง] [Garena] กล่องอุปกรณ์ Wizard Crate",
  "DFRocket825": "[เสบียง] [Garena] กล่องยุทธวิธี Rocket Pack",
  "DFHeroic668": "[เสบียง] [Garena] กล่องอุปกรณ์ฮีโร่ Heroic Crate",
  "DFFantasy742": "[เสบียง] [Garena] กล่องเสบียง Fantasy Pack",
  "DFFlash260": "[เสบียง] [Garena] กล่องเสบียง Flash Pack",
  "Top1BXHVN": "[เสบียง] [Garena] กล่องฉลอง Top 1 BXHVN",
  "A5Z1NDW8K3PJLU": "[เสบียง] [Garena] กล่องยุทธวิธีพิเศษ",
  "ReturningWarrior1": "[เสบียง] [Garena] เซ็ตต้อนรับผู้เล่นกลับมา Returning Warrior 1",
  "ReturningWarrior2": "[เสบียง] [Garena] เซ็ตต้อนรับผู้เล่นกลับมา Returning Warrior 2",
  "ReturningWarrior3": "[เสบียง] [Garena] เซ็ตต้อนรับผู้เล่นกลับมา Returning Warrior 3",
  "N4SQWgxYcHw7gUci3bJy": "[เสบียง] [Garena] แพ็กเกจยุทธวิธี",
  "aCuQjtxY7vXGjxCTBnQU": "[เสบียง] [Garena] แพ็กเกจยุทธวิธี",
  "CmtMZaxYuX8m8wZUDqFM": "[เสบียง] [Garena] แพ็กเกจยุทธวิธี",
  "fvzeLrxYajwVviFSTSZ": "[เสบียง] [Garena] แพ็กเกจยุทธวิธี"
};

for (const [k, v] of Object.entries(garenaNotes)) {
  if (data.codes[k]) {
    data.codes[k].note = v;
  }
}

for (const [k, v] of Object.entries(newCodes)) {
  data.codes[k] = Object.assign(data.codes[k] || {}, v);
}

const formatted = JSON.stringify(data, null, 2) + '\n';
fs.writeFileSync(path.join(__dirname, '..', 'data', 'codes.json'), formatted, 'utf8');
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'codes.json'), formatted, 'utf8');
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'data', 'codes.json'), formatted, 'utf8');
console.log('Updated data/codes.json and docs/ with ' + Object.keys(data.codes).length + ' codes!');
