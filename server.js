const express = require('express');
const app = express();
app.use(express.json());
app.use(express.static('public'));

// 本来はMongoDB等に保存しますが、一旦メモリ上でシミュレート
let users = []; 

// アカウント作成
app.post('/register', (req, res) => {
    const { username, password } = req.body;
    const newUser = {
        username,
        password,
        lv: 1,
        hp: 100,
        str: 10,
        sp: 20,
        gold: 0,
        boostUntil: null
    };
    users.push(newUser);
    res.json({ message: "登録完了！", user: newUser });
});

// ログイン
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    if (user) {
        res.json({ message: "ログイン成功！", user });
    } else {
        res.status(401).json({ message: "名前かパスワードが違います" });
    }
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));
