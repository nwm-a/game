const express = require('express');
const app = express();

// RenderでIPを正しく取得するための設定
app.set('trust proxy', true);

app.use(express.json());
app.use(express.static('public'));

// --- JSONBin 設定 ---
const BIN_ID = '69a3a1b543b1c97be9a810b9'; 
const API_KEY = '$2a$10$9bpgr6XdVfm2dse9sHVrwue/2XjErfVsacCU0qYXpEK3GOcE2vOsC'; // $2a$10$ から始まるキー

let users = {}; 
let registeredIPs = {};
let chatLogs = []; 

// 闘技場データ（これは再起動でリセットされても良いならこのままでOK）
let arena = {
    floor1: { title: "【第1階：新星の門】", owner: { username: "訓練用門番C", hp: 150, str: 15, vit: 12, agi: 10, dex: 10, luk: 10, icon: "🛡️" }, winStreak: 0, required: null },
    floor2: { title: "【第2階：猛者の壁】", owner: { username: "訓練用門番B", hp: 300, str: 25, vit: 20, agi: 15, dex: 15, luk: 15, icon: "⚔️" }, winStreak: 0, required: "floor1" },
    floor3: { title: "【第3階：頂点の座】", owner: { username: "訓練用門番A", hp: 500, str: 40, vit: 35, agi: 20, dex: 20, luk: 20, icon: "👑" }, winStreak: 0, required: "floor2" }
};

// --- データ永続化関数 ---
async function loadData() {
    try {
        const res = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
            headers: { 'X-Master-Key': API_KEY }
        });
        const data = await res.json();
        if (data.record) {
            users = data.record.users || {};
            registeredIPs = data.record.registeredIPs || {};
            console.log("✅ クラウドから筋肉データを復元しました");
        }
    } catch (err) {
        console.error("❌ データ読み込み失敗:", err);
    }
}

async function saveData() {
    try {
        await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': API_KEY
            },
            body: JSON.stringify({ users, registeredIPs })
        });
        console.log("💾 クラウドへ保存完了");
    } catch (err) {
        console.error("❌ 保存失敗:", err);
    }
}

// 起動時にロード
loadData();

// --- 基本関数（変更なし） ---
function getNextExp(lv) {
    return (lv >= 100) ? 100 + (Math.floor((lv - 100) / 25) + 1) * 10 : 100;
}

function calculateAttack(attacker, defender, isPlayer) {
    let logs = [];
    const nameA = isPlayer ? `<span style="color:#4f4">★${attacker.username}</span>` : `<span style="color:#f44">${attacker.username || attacker.name}</span>`;
    const nameD = !isPlayer ? `<span style="color:#4f4">★${defender.username}</span>` : `<span style="color:#f44">${defender.username || defender.name}</span>`;
    const hitRate = 85 + (attacker.dex - defender.agi) * 2;
    if (Math.random() * 100 > Math.min(95, Math.max(50, hitRate))) {
        logs.push(`${nameA} の攻撃 ⇒ ${nameD} は回避した！`);
        return { damage: 0, logs };
    }
    const critRate = 5 + (attacker.luk * 0.1);
    const isCrit = Math.random() * 100 < critRate;
    let damage = Math.floor(attacker.str - (defender.vit * 0.8));
    if (damage <= 0) {
        logs.push(`${nameA} の攻撃 ⇒ ${nameD} に弾かれた！`);
        return { damage: 0, logs };
    }
    if (isCrit) {
        damage = Math.floor(damage * 2.0);
        logs.push(`<b style="color:yellow">⚡CRITICAL!</b> ${nameA} の一撃！`);
    }
    logs.push(`${nameA} の攻撃 ⇒ ${nameD} に <b style="color:#fff">${damage}</b> のダメージ！`);
    return { damage, logs };
}

// --- エンドポイント ---

app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    if (!username || !password) return res.status(400).json({ message: "入力不足" });
    if (users[username]) return res.status(400).json({ message: "使用中" });
    if (registeredIPs[ip]) return res.status(400).json({ message: `1端末1名までです（${registeredIPs[ip]}として登録済）` });

    const threeDays = 3 * 24 * 60 * 60 * 1000;
    users[username] = {
        username, password, lv: 1, exp: 0, gold: 100, stone: 5,
        icon: "✊", style: "normal", arenaHistory: {},
        hp: 100, str: 10, dex: 10, agi: 10, vit: 10, luk: 10,
        equipment: {
            weapon: { name: "ボロいグローブ", str_bonus: 5, dex_bonus: 2, plus: 0 },
            armor: { name: "タンクトップ", vit_bonus: 3, agi_bonus: 1, plus: 0 },
            accessory: { name: "お守り", hp_bonus: 10, luk_bonus: 5, plus: 0 }
        },
        unlockedAreas: ["area1"], lastAction: 0, lastArenaAction: 0,
        boostUntil: Date.now() + threeDays 
    };
    registeredIPs[ip] = username;
    await saveData();
    res.json({ user: users[username] });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = users[username];
    if (user && user.password === password) res.json({ user });
    else res.status(401).json({ message: "名前かパスが違います" });
});

app.post('/update-profile', async (req, res) => {
    const { oldName, newName, icon, style } = req.body;
    const user = users[oldName];
    if (!user) return res.status(404).json({ message: "User Not Found" });
    if (newName && newName !== oldName) {
        if (users[newName]) return res.status(400).json({ message: "その名前は既にあります" });
        users[newName] = user; delete users[oldName]; user.username = newName;
        // IP登録名も更新
        for (let key in registeredIPs) {
            if (registeredIPs[key] === oldName) registeredIPs[key] = newName;
        }
    }
    user.icon = icon; user.style = style;
    await saveData();
    res.json({ user });
});

app.post('/explore', async (req, res) => {
    const { username, areaId } = req.body;
    const user = users[username];
    const now = Date.now();
    const waitTime = user.boostUntil > now ? 20000 : 30000;
    if (now - user.lastAction < waitTime) return res.status(400).json({ message: "筋肉を休ませてください" });

    user.lastAction = now;
    let bLogs = [];
    const areaData = {
        area1: { name: "はじまりの森", lv: 1, boss: "森の番長" },
        area2: { name: "荒野の廃墟", lv: 10, boss: "砂漠の王" },
        area3: { name: "竜の巣", lv: 20, boss: "古龍ドラグニル" }
    };
    const current = areaData[areaId];
    const isBoss = Math.random() < 0.05;
    const m = isBoss ? 2.5 : 1.0;

    const enemy = {
        username: isBoss ? `【BOSS】${current.boss}` : `${current.name}の魔物`,
        hp: Math.floor((30 + current.lv * 15) * m),
        str: Math.floor((8 + current.lv * 2) * m),
        vit: Math.floor((5 + current.lv * 1.5) * m),
        agi: Math.floor((5 + current.lv * 1.2) * m),
        dex: Math.floor((5 + current.lv * 1.2) * m),
        luk: Math.floor((5 + current.lv) * m)
    };

    const eq = user.equipment;
    let player = { ...user, hp: user.hp + eq.accessory.hp_bonus, str: user.str + eq.weapon.str_bonus + (eq.weapon.plus * 3), vit: user.vit + eq.armor.vit_bonus + (eq.armor.plus * 2), agi: user.agi + eq.armor.agi_bonus + (eq.armor.plus * 1), dex: user.dex + eq.weapon.dex_bonus + (eq.weapon.plus * 1), luk: user.luk + eq.accessory.luk_bonus + (eq.accessory.plus * 1) };
    if (user.style === "offense") { player.str *= 1.3; player.vit *= 0.7; }
    if (user.style === "defense") { player.str *= 0.7; player.vit *= 1.3; }

    bLogs.push(`<b style="color:orange; font-size:1.1em;">⚔️ ${enemy.username}が現れた！</b><hr style="border:0;border-top:1px solid #333">`);

    let turn = 1; let win = false;
    while (turn <= 15) {
        const pFirst = player.agi >= enemy.agi;
        const res1 = calculateAttack(pFirst ? player : enemy, pFirst ? enemy : player, pFirst);
        bLogs.push(res1.logs[0]);
        if (pFirst) enemy.hp -= res1.damage; else player.hp -= res1.damage;
        if (enemy.hp <= 0) { win = true; break; } if (player.hp <= 0) break;
        const res2 = calculateAttack(!pFirst ? player : enemy, !pFirst ? enemy : player, !pFirst);
        bLogs.push(res2.logs[0]);
        if (!pFirst) enemy.hp -= res2.damage; else player.hp -= res2.damage;
        if (enemy.hp <= 0) { win = true; break; } if (player.hp <= 0) break;
        turn++;
    }

    if (win) {
        const bonus = user.boostUntil > now ? 1.5 : 1.0;
        const g = Math.floor(Math.random() * 20 + 10) * m;
        const e = Math.floor(30 * m * bonus);
        user.gold += g; user.exp += e;
        bLogs.push(`<b style="color:yellow">🏆 勝利！ ${g}G / ${e}EXP 獲得</b>`);
        if (Math.random() < 0.3) { user.stone += 1; bLogs.push("💎 強化石を拾った！"); }
        while (user.exp >= getNextExp(user.lv)) {
            user.exp -= getNextExp(user.lv); user.lv++;
            user.str+=2; user.vit+=2; user.agi+=1; user.dex+=1; user.hp+=10;
            bLogs.push(`<b style="color:cyan">✨ LEVEL UP! Lv.${user.lv}</b>`);
        }
    } else bLogs.push('<b style="color:red">💀 敗北...</b>');

    await saveData();
    res.json({ battleLogs: bLogs, user, nextActionIn: waitTime / 1000 });
});

app.post('/arena/challenge', async (req, res) => {
    const { username, floorId } = req.body;
    const user = users[username];
    const targetFloor = arena[floorId];
    const now = Date.now();

    if (now - (user.lastArenaAction || 0) < 60000) return res.status(400).json({ message: "クールタイム1分" });
    if (targetFloor.required && (!user.arenaHistory || !user.arenaHistory[targetFloor.required])) return res.status(400).json({ message: "下の階の王者になれ！" });

    user.lastArenaAction = now;
    let p1 = { ...user, hp: user.hp + user.equipment.accessory.hp_bonus, str: user.str + user.equipment.weapon.str_bonus + (user.equipment.weapon.plus * 3), vit: user.vit + user.equipment.armor.vit_bonus + (user.equipment.armor.plus * 2), agi: user.agi + user.equipment.armor.agi_bonus + (user.equipment.armor.plus * 1), dex: user.dex + user.equipment.weapon.dex_bonus + (user.equipment.weapon.plus * 1), luk: user.luk + user.equipment.accessory.luk_bonus + (user.equipment.accessory.plus * 1) };
    let p2 = JSON.parse(JSON.stringify(targetFloor.owner));
    // 王者のステータスはそのまま（補正込で保存されているはず）

    let bLogs = [`<b style="color:#fc0; font-size:1.1em;">🏟️ ${p2.username} 王への挑戦！</b>`];
    let turn = 1; let win = false;
    while (turn <= 20) {
        const res1 = calculateAttack(p1, p2, true); bLogs.push(res1.logs[0]); p2.hp -= res1.damage;
        if (p2.hp <= 0) { win = true; break; }
        const res2 = calculateAttack(p2, p1, false); bLogs.push(res2.logs[0]); p1.hp -= res2.damage;
        if (p1.hp <= 0) break;
        turn++;
    }

    if (win) {
        targetFloor.owner = JSON.parse(JSON.stringify(user));
        targetFloor.winStreak = 1;
        if(!user.arenaHistory) user.arenaHistory = {};
        user.arenaHistory[floorId] = true;
        bLogs.push(`<b style="color:yellow">🎊 あなたが新王者です！</b>`);
    } else {
        targetFloor.winStreak++;
        bLogs.push(`<b style="color:red">💀 敗北...</b>`);
    }
    await saveData();
    res.json({ battleLogs: bLogs, user, win });
});

app.post('/enhance', async (req, res) => {
    const { username, part } = req.body;
    const user = users[username];
    const item = user.equipment[part];
    const cost = Math.floor(item.plus / 3) + 1;
    if (user.stone < cost) return res.status(400).json({ message: "石不足" });
    user.stone -= cost; item.plus += 1;
    await saveData();
    res.json({ user });
});

app.post('/shop', async (req, res) => {
    const { username, itemId } = req.body;
    const user = users[username];
    const price = itemId === 'protein' ? 1000 : 300;
    if (user.gold < price) return res.status(400).json({ message: "GOLD不足" });
    user.gold -= price;
    if (itemId === 'protein') user.boostUntil = Math.max(user.boostUntil, Date.now()) + 604800000;
    else user.stone += 1;
    await saveData();
    res.json({ user });
});

app.post('/sell', async (req, res) => {
    const { username, itemId } = req.body;
    const user = users[username];
    if (itemId === 'stone' && user.stone > 0) {
        user.stone--; user.gold += 150;
        await saveData();
        res.json({ user });
    } else res.status(400).json({ message: "売却不可" });
});

app.get('/user/:username', (req, res) => {
    const target = users[req.params.username];
    if (target) {
        const { password, ...publicData } = target;
        res.json(publicData);
    } else res.status(404).json({ message: "Player Not Found" });
});

app.get('/chat', (req, res) => res.json(chatLogs));
app.post('/chat', (req, res) => {
    const { username, message, icon } = req.body;
    chatLogs.push({ username, message, icon, time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) });
    if (chatLogs.length > 30) chatLogs.shift();
    res.json(chatLogs);
});

app.get('/arena', (req, res) => res.json(arena));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
