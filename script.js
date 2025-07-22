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

// ### 初期化処理 ###
document.addEventListener('DOMContentLoaded', async () => {
    populateTimeSelects();
    initializeCalendar();
    await loadMembers(); // メンバーの読み込みを待つ
    loadAllStatuses();

    // 日付入力のデフォルトを今日にする
    const today = new Date();
    document.getElementById('schedule-date').value = formatDate(today);
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
    
    let isFirst = true;
    membersCollection.forEach(doc => {
        const member = doc.data();
        membersData[doc.id] = { name: member.name, color: member.color || '#3788d8' };
        
        const radioId = `user-${doc.id}`;
        const wrapper = document.createElement('div');
        const input = document.createElement('input');
        input.type = 'radio';
        input.id = radioId;
        input.name = 'user';
        input.value = doc.id;
        if (isFirst) {
            input.checked = true;
            isFirst = false;
        }

        const label = document.createElement('label');
        label.htmlFor = radioId;
        label.textContent = member.name;

        wrapper.appendChild(input);
        wrapper.appendChild(label);
        radioContainer.appendChild(wrapper);
    });
}

// 全メンバーの最新ステータスを読み込み、テーブルを更新
async function loadAllStatuses() {
    const tableBody = document.querySelector('#status-table tbody');
    tableBody.innerHTML = '';

    const membersSnapshot = await db.collection('members').orderBy('order').get();
    
    for (const memberDoc of membersSnapshot.docs) {
        const memberId = memberDoc.id;
        const memberName = memberDoc.data().name;

        const logSnapshot = await db.collection('logs').where('userId', '==', memberId).orderBy('timestamp', 'desc').limit(1).get();
        
        let status = '不在';
        let statusClass = 'status-away';
        let timestamp = '-';

        if (!logSnapshot.empty) {
            const latestLog = logSnapshot.docs[0].data();
            status = latestLog.status;
            timestamp = latestLog.timestamp.toDate().toLocaleString('ja-JP');
            if (status === '在室') statusClass = 'status-in';
            else if (status === '外室中') statusClass = 'status-out';
        }

        const row = tableBody.insertRow();
        row.innerHTML = `
            <td>${memberName}</td>
            <td><span class="status-badge ${statusClass}">${status}</span></td>
            <td><span class="timestamp">${timestamp}</span></td>
        `;
    }
}

// ### データ書き込み系の関数 (Firestore) ###

// 打刻処理
async function checkin(status) {
    const selectedUser = document.querySelector('input[name="user"]:checked');
    if (!selectedUser) {
        alert('ユーザーを選択してください');
        return;
    }
    const userId = selectedUser.value;

    try {
        await db.collection('logs').add({
            userId: userId,
            status: status,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert(`「${status}」で打刻しました。`);
        loadAllStatuses();
    } catch (error) {
        console.error("Error adding document: ", error);
        alert('打刻に失敗しました。');
    }
}

// 予定登録処理
async function updateSchedule() {
    const selectedUser = document.querySelector('input[name="user"]:checked');
    if (!selectedUser) {
        alert('ユーザーを選択してください');
        return;
    }
    const userId = selectedUser.value;

    const date = document.getElementById('schedule-date').value;
    const remarks = document.getElementById('schedule-remarks').value.trim();
    const startTime = `${document.getElementById('start-hour').value}:${document.getElementById('start-minute').value}`;
    const endTime = `${document.getElementById('end-hour').value}:${document.getElementById('end-minute').value}`;
    const scheduleTime = `${startTime}-${endTime}`;
    
    if (!date) {
        alert('日付を選択してください。');
        return;
    }

    try {
        const querySnapshot = await db.collection('schedules').where('userId', '==', userId).where('date', '==', date).get();

        const scheduleData = {
            userId, date, time: scheduleTime,
            remarks: remarks || '' // 備考が空なら空文字を保存
        };

        if (querySnapshot.empty) {
            await db.collection('schedules').add(scheduleData);
        } else {
            const docId = querySnapshot.docs[0].id;
            await db.collection('schedules').doc(docId).update(scheduleData);
        }

        alert('予定を登録しました。');
        calendar.refetchEvents(); // カレンダーを再描画
    } catch (error) {
        console.error("Error updating schedule: ", error);
        alert('予定の登録に失敗しました。');
    }
}

// ### カレンダー関連の関数 ###

function initializeCalendar() {
    const calendarEl = document.getElementById('calendar');
    calendar = new FullCalendar.Calendar(calendarEl, {
        locale: 'ja',
        initialView: 'dayGridMonth',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek'
        },
        views: {
            timeGridWeek: {
                allDayText: 'メンバー' // all-dayスロットのテキストを変更
            }
        },
        events: fetchCalendarEvents,
        // 備考ツールチップ表示
        eventDidMount: function(info) {
            if (info.event.extendedProps.remarks) {
                tippy(info.el, {
                    content: info.event.extendedProps.remarks,
                });
            }
        }
    });
    calendar.render();
}

async function fetchCalendarEvents(fetchInfo, successCallback, failureCallback) {
    try {
        const schedulesSnapshot = await db.collection('schedules').get();
        const events = [];
        
        schedulesSnapshot.docs.forEach(doc => {
            const schedule = doc.data();
            const memberInfo = membersData[schedule.userId];
            if (!memberInfo) return; // メンバー情報がなければスキップ

            const memberName = memberInfo.name;
            const memberColor = memberInfo.color;
            const remarksText = schedule.remarks ? ' (!)' : '';
            
            // --- 月表示用のイベント ---
            if (fetchInfo.view.type === 'dayGridMonth') {
                events.push({
                    title: `${memberName}${remarksText}`,
                    start: schedule.date,
                    allDay: true,
                    backgroundColor: memberColor,
                    borderColor: memberColor,
                    extendedProps: { remarks: schedule.remarks }
                });
            }
            
            // --- 週表示用のイベント ---
            if (fetchInfo.view.type === 'timeGridWeek') {
                // 1. all-dayスロットに名前を表示するためのイベント
                events.push({
                    title: `${memberName}${remarksText}`,
                    start: schedule.date,
                    allDay: true,
                    backgroundColor: memberColor,
                    borderColor: memberColor,
                    extendedProps: { remarks: schedule.remarks }
                });

                // 2. 時間グリッドに棒グラフを表示するためのイベント
                const [startTime, endTime] = schedule.time.split('-');
                if(startTime && endTime) {
                    events.push({
                        title: memberName, // 棒グラフの上に名前を表示
                        start: `${schedule.date}T${startTime}`,
                        end: `${schedule.date}T${endTime}`,
                        backgroundColor: memberColor,
                        borderColor: memberColor,
                        extendedProps: { remarks: schedule.remarks }
                    });
                }
            }
        });
        successCallback(events);
    } catch (error) {
        console.error('Error fetching events:', error);
        failureCallback(error);
    }
}
