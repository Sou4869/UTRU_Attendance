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

// グローバル変数としてカレンダーインスタンスを保持
let calendar;

// ### 初期化処理 ###
document.addEventListener('DOMContentLoaded', () => {
    populateTimeSelects();
    initializeCalendar();
    loadMembers();
    loadAllStatuses();

    // 日付入力のデフォルトを今日にする
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    document.getElementById('schedule-date').value = `${yyyy}-${mm}-${dd}`;
});


// ### UI生成系の関数 ###

// 時刻選択のプルダウンを生成する
function populateTimeSelects() {
    const startHourSelect = document.getElementById('start-hour');
    const endHourSelect = document.getElementById('end-hour');
    for (let i = 0; i < 24; i++) {
        const hour = String(i).padStart(2, '0');
        startHourSelect.innerHTML += `<option value="${hour}">${hour}</option>`;
        endHourSelect.innerHTML += `<option value="${hour}">${hour}</option>`;
    }
    // デフォルト値設定
    startHourSelect.value = '10';
    endHourSelect.value = '18';
}

// ### データ読み込み系の関数 (Firestore) ###

// メンバー情報を読み込んでプルダウンに設定
async function loadMembers() {
    const userSelect = document.getElementById('user-select');
    userSelect.innerHTML = ''; // クリア
    const membersCollection = await db.collection('members').orderBy('order').get();
    
    membersCollection.forEach(doc => {
        const member = doc.data();
        const option = document.createElement('option');
        option.value = doc.id;
        option.textContent = member.name;
        userSelect.appendChild(option);
    });
}

// 全メンバーの最新ステータスを読み込み、テーブルを更新
async function loadAllStatuses() {
    const tableBody = document.querySelector('#status-table tbody');
    tableBody.innerHTML = ''; // クリア

    const membersSnapshot = await db.collection('members').orderBy('order').get();
    
    for (const memberDoc of membersSnapshot.docs) {
        const memberId = memberDoc.id;
        const memberName = memberDoc.data().name;

        // 各メンバーの最新ログを1件取得
        const logSnapshot = await db.collection('logs')
            .where('userId', '==', memberId)
            .orderBy('timestamp', 'desc')
            .limit(1)
            .get();
        
        let status = '未登録';
        let timestamp = '-';

        if (!logSnapshot.empty) {
            const latestLog = logSnapshot.docs[0].data();
            status = latestLog.status;
            timestamp = latestLog.timestamp.toDate().toLocaleString('ja-JP');
        }

        const row = tableBody.insertRow();
        row.innerHTML = `
            <td>${memberName}</td>
            <td>${status}</td>
            <td class="timestamp">${timestamp}</td>
        `;
    }
}

// ### データ書き込み系の関数 (Firestore) ###

// 打刻処理
async function checkin(status) {
    const userId = document.getElementById('user-select').value;
    if (!userId) {
        alert('ユーザーを選択してください');
        return;
    }

    try {
        await db.collection('logs').add({
            userId: userId,
            status: status,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert(`「${status}」で打刻しました。`);
        loadAllStatuses(); // テーブルを更新
    } catch (error) {
        console.error("Error adding document: ", error);
        alert('打刻に失敗しました。');
    }
}

// 予定登録処理
async function updateSchedule() {
    const userId = document.getElementById('user-select').value;
    const date = document.getElementById('schedule-date').value;
    const remarks = document.getElementById('schedule-remarks').value;

    const startTime = `${document.getElementById('start-hour').value}:${document.getElementById('start-minute').value}`;
    const endTime = `${document.getElementById('end-hour').value}:${document.getElementById('end-minute').value}`;
    const scheduleTime = `${startTime}-${endTime}`;
    
    if (!userId || !date) {
        alert('ユーザーと日付を選択してください。');
        return;
    }

    try {
        // 同じユーザー・同じ日付のドキュメントを探す
        const querySnapshot = await db.collection('schedules')
            .where('userId', '==', userId)
            .where('date', '==', date)
            .get();

        if (querySnapshot.empty) {
            // 新規作成
            await db.collection('schedules').add({
                userId: userId,
                date: date,
                time: scheduleTime,
                remarks: remarks
            });
        } else {
            // 既存のドキュメントを更新
            const docId = querySnapshot.docs[0].id;
            await db.collection('schedules').doc(docId).update({
                time: scheduleTime,
                remarks: remarks
            });
        }

        alert('予定を登録しました。');
        calendar.refetchEvents(); // カレンダーのイベントを再読み込み
    } catch (error) {
        console.error("Error updating schedule: ", error);
        alert('予定の登録に失敗しました。');
    }
}


// ### カレンダー関連の関数 ###

// FullCalendarの初期化と設定
function initializeCalendar() {
    const calendarEl = document.getElementById('calendar');
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'ja',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek'
        },
        events: fetchCalendarEvents // イベントを動的に取得する関数を指定
    });
    calendar.render();
}

// Firestoreから予定を取得し、カレンダーが読める形式に変換する
async function fetchCalendarEvents(fetchInfo, successCallback, failureCallback) {
    try {
        const membersSnapshot = await db.collection('members').get();
        const members = {};
        membersSnapshot.forEach(doc => {
            members[doc.id] = doc.data().name;
        });

        const schedulesSnapshot = await db.collection('schedules').get();
        const events = schedulesSnapshot.docs.map(doc => {
            const schedule = doc.data();
            const memberName = members[schedule.userId] || '不明';
            const remarksText = schedule.remarks ? ` (${schedule.remarks})` : '';

            return {
                title: `${memberName}: ${schedule.time}${remarksText}`,
                start: schedule.date,
                allDay: true // 終日イベントとして表示
            };
        });
        successCallback(events);
    } catch (error) {
        console.error('Error fetching events for calendar:', error);
        failureCallback(error);
    }
}
