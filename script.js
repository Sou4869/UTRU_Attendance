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

// --- 初期化 ---
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore(app);
let calendar;
let membersData = {};
const japanHolidays = {};

document.addEventListener('DOMContentLoaded', async () => {
    populateTimeSelects();
    await loadMembers();
    initializeCalendar();
    loadAllStatuses();
    document.getElementById('schedule-date').value = formatDate(new Date());
});

// --- UI操作 ---
function populateTimeSelects() { /* ...変更なし... */ }
function setDate(daysFromNow) { /* ...変更なし... */ }
function formatDate(date) { /* ...変更なし... */ }

async function loadMembers() {
    const statusRadioContainer = document.getElementById('status-user-radios');
    const scheduleRadioContainer = document.getElementById('schedule-user-radios');
    statusRadioContainer.innerHTML = '';
    scheduleRadioContainer.innerHTML = '';
    const membersCollection = await db.collection('members').orderBy('order').get();

    membersCollection.forEach(doc => {
        const member = doc.data();
        // firstnameとlastnameを取得
        membersData[doc.id] = { 
            firstname: member.firstname || '', 
            lastname: member.lastname || '不明', 
            color: member.color || '#3788d8' 
        };
        const fullName = `${member.lastname} ${member.firstname}`;
        
        [
            { container: statusRadioContainer, name: 'status_user' },
            { container: scheduleRadioContainer, name: 'schedule_user' }
        ].forEach(group => {
            const radioId = `${group.name}-${doc.id}`;
            const wrapper = document.createElement('div');
            const input = document.createElement('input');
            input.type = 'radio'; input.id = radioId; input.name = group.name; input.value = doc.id;
            const label = document.createElement('label');
            label.htmlFor = radioId; label.textContent = fullName;
            wrapper.appendChild(input); wrapper.appendChild(label);
            group.container.appendChild(wrapper);
        });
    });
}

async function loadAllStatuses() {
    const tableBody = document.querySelector('#status-table tbody');
    tableBody.innerHTML = '';
    const membersSnapshot = await db.collection('members').orderBy('order').get();
    for (const memberDoc of membersSnapshot.docs) {
        const memberId = memberDoc.id;
        const memberName = `${memberDoc.data().lastname} ${memberDoc.data().firstname}`;
        const logSnapshot = await db.collection('logs').where('userId', '==', memberId).orderBy('timestamp', 'desc').limit(1).get();
        let status = '不在', statusClass = 'status-away', timestamp = '-';
        if (!logSnapshot.empty) {
            const latestLog = logSnapshot.docs[0].data();
            status = latestLog.status;
            const date = latestLog.timestamp.toDate();
            const yyyy = date.getFullYear();
            const mm = String(date.getMonth() + 1).padStart(2, '0');
            const dd = String(date.getDate()).padStart(2, '0');
            const HH = String(date.getHours()).padStart(2, '0');
            const MM = String(date.getMinutes()).padStart(2, '0');
            timestamp = `${yyyy}/${mm}/${dd} ${HH}:${MM}`;
            if (status === '在室') statusClass = 'status-in';
            else if (status === '外室中') statusClass = 'status-out';
        }
        const row = tableBody.insertRow();
        row.innerHTML = `<td>${memberName}</td><td><span class="status-badge ${statusClass}">${status}</span></td><td><span class="timestamp">${timestamp}</span></td>`;
    }
}

// --- データ書き込み (Firestore) ---
async function checkin(status) { /* ...変更なし... */ }
async function updateSchedule() { /* ...変更なし... */ }

// --- カレンダー関連 ---
async function fetchJapanHolidays() { /* ...変更なし... */ }

function initializeCalendar() {
    const calendarEl = document.getElementById('calendar');
    calendar = new FullCalendar.Calendar(calendarEl, {
        locale: 'ja',
        initialView: 'dayGridMonth',
        headerToolbar: {
            left: 'prev,today,next',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek'
        },
        height: 'auto',
        slotMinTime: '08:00:00', // 週表示の開始時間
        slotMaxTime: '22:00:00', // 週表示の終了時間
        views: {
            timeGridWeek: { allDayText: 'メンバー' }
        },
        dayCellContent: function(arg) {
            // 月表示の日付から「日」を削除
            return { html: arg.dayNumberText.replace('日', '') };
        },
        dayHeaderContent: function(arg) {
            // 週表示のヘッダーをカスタマイズ
            const date = arg.date;
            const dayNum = date.getDate();
            const dayOfWeek = new Intl.DateTimeFormat('ja-JP', { weekday: 'short' }).format(date);
            if (window.innerWidth < 768) {
                return { html: `${dayNum}<br>${dayOfWeek}` };
            }
            return `${dayNum} (${dayOfWeek})`;
        },
        viewDidMount: function(view) {
            // ビューが切り替わったときにイベントを再取得・再描画する
            calendar.refetchEvents();
        },
        eventClick: async function(info) { /* ...変更なし... */ },
        eventContent: function(arg) {
            const memberInfo = membersData[arg.event.extendedProps.userId];
            if (!memberInfo) return;

            let titleHtml = '';
            let classNames = arg.event.classNames.slice();

            const isMobile = window.innerWidth < 768;

            if (arg.view.type === 'dayGridMonth') {
                titleHtml = isMobile ? memberInfo.lastname : `${memberInfo.lastname} ${memberInfo.firstname}`;
            } else if (arg.view.type === 'timeGridWeek') {
                if (arg.event.allDay) {
                    titleHtml = isMobile ? memberInfo.lastname : `${memberInfo.lastname} ${memberInfo.firstname}`;
                } else {
                    if (isMobile) {
                        titleHtml = ''; // スマホのバーは名前なし
                    } else {
                        titleHtml = `${memberInfo.lastname}<br>${memberInfo.firstname}`;
                        classNames.push('fc-event-vertical'); // 縦書きクラス
                    }
                }
            }
            
            if (arg.event.extendedProps.remarks) {
                titleHtml += `<span class="remarks-indicator">💬</span>`;
            }
            
            return { html: titleHtml, classNames: classNames };
        },
        eventDidMount: function(info) { /* ...変更なし... */ },
        datesSet: async function(info) { /* ...変更なし... */ },
        events: fetchCalendarEvents
    });
    
    fetchJapanHolidays().then(() => {
        calendar.render();
    });
}

async function fetchCalendarEvents(fetchInfo, successCallback, failureCallback) {
    try {
        const schedulesSnapshot = await db.collection('schedules').get();
        const events = [];
        schedulesSnapshot.docs.forEach(doc => {
            const schedule = doc.data();
            const memberInfo = membersData[schedule.userId];
            if (!memberInfo) return;

            const eventProps = { firestoreId: doc.id, userId: schedule.userId, remarks: schedule.remarks };
            
            // 週表示の場合、all-dayとtimedの両方のイベントを作成
            if (calendar.view.type === 'timeGridWeek') {
                events.push({
                    title: '', // 表示はeventContentで制御
                    start: schedule.date,
                    allDay: true,
                    backgroundColor: memberInfo.color,
                    borderColor: memberInfo.color,
                    extendedProps: eventProps
                });
                const [startTime, endTime] = schedule.time.split('-');
                if (startTime && endTime) {
                    events.push({
                        title: '', // 表示はeventContentで制御
                        start: `${schedule.date}T${startTime}`,
                        end: `${schedule.date}T${endTime}`,
                        backgroundColor: memberInfo.color,
                        borderColor: memberInfo.color,
                        extendedProps: eventProps
                    });
                }
            } else { // 月表示の場合
                events.push({
                    title: '', // 表示はeventContentで制御
                    start: schedule.date,
                    allDay: true,
                    backgroundColor: memberInfo.color,
                    borderColor: memberInfo.color,
                    extendedProps: eventProps
                });
            }
        });
        successCallback(events);
    } catch (error) {
        console.error('Error fetching events:', error);
        failureCallback(error);
    }
}
