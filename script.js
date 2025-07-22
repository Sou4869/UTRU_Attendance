// 【重要】ご自身のFirebaseプロジェクトの設定情報に書き換えてください
const firebaseConfig = {
  apiKey: "AIzaSyB3bnLhC5fIDqo9mAn95_rT6Lr4HJU4FGA",
  authDomain: "utru-attendance.firebaseapp.com",
  projectId: "utru-attendance",
  storageBucket: "utru-attendance.firebasestorage.app",
  messagingSenderId: "978945866229",
  appId: "1:978945866229:web:47857dedd503b3ce3308bc",
  measurementId: "G-BQSGVBXF8G"
};

// Firebaseの初期化
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore(app);

let calendar;
let membersData = {}; // メンバー情報をグローバルに保持 (名前と色)
const japanHolidays = {}; // 祝日データをキャッシュ

// ### 初期化処理 ###
document.addEventListener('DOMContentLoaded', async () => {
    populateTimeSelects();
    await loadMembers(); // メンバーの読み込みを待つ
    initializeCalendar();
    loadAllStatuses();

    // 日付入力のデフォルトを今日にする
    const today = new Date();
    document.getElementById('schedule-date').value = formatDate(today);

    await fetchJapanHolidays(today.getFullYear());
    calendar.refetchEvents(); // 祝日反映のために再描画
});

// ### UI生成・操作系の関数 ###

// 時刻選択のプルダウンを生成
function populateTimeSelects() {
    const startHourSelect = document.getElementById('start-hour');
    const endHourSelect = document.getElementById('end-hour');
    for (let i = 0; i < 24; i++) {
        const hour = String(i).padStart(2, '0');
        startHourSelect.innerHTML += `<option value="${hour}">${hour}</option>`;
        endHourSelect.innerHTML += `<option value="${hour}">${hour}</option>`;
    }
    startHourSelect.value = '10';
    endHourSelect.value = '18';
}

// 日付設定ボタンの処理
function setDate(daysFromNow) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysFromNow);
    document.getElementById('schedule-date').value = formatDate(targetDate);
}

// DateオブジェクトをYYYY-MM-DD形式の文字列に変換
function formatDate(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// ### データ読み込み系の関数 (Firestore) ###

// メンバー情報を読み込み、グローバル変数に保存し、ラジオボタンを生成
async function loadMembers() {
    const radioContainer = document.getElementById('user-radio-buttons');
    radioContainer.innerHTML = '';
    const membersCollection = await db.collection('members').orderBy('order').get();

    membersCollection.forEach(doc => {
        const member = doc.data();
        membersData
