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

function setDate(daysFromNow) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysFromNow);
    document.getElementById('schedule-date').value = formatDate(targetDate);
}

function formatDate(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

async function loadMembers() {
    const statusRadioContainer = document.getElementById('status-user-radios');
    const scheduleRadioContainer = document.getElementById('schedule-user-radios');
    statusRadioContainer.innerHTML = '';
    scheduleRadioContainer.innerHTML = '';
    const membersCollection = await db.collection('members').orderBy('order').get();

    membersCollection.forEach(doc => {
        const member = doc.data();
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
            input.type = 'radio';
            input.id = radioId;
            input.name = group.name;
            input.value = doc.id;
            input.onchange = (e) => syncRadioButtons(e.target);
            const label = document.createElement('label');
            label.htmlFor = radioId;
            label.textContent = fullName;
            wrapper.appendChild(input);
            wrapper.appendChild(label);
            group.container.appendChild(wrapper);
        });
    });
}

function syncRadioButtons(changedRadio) {
    const targetName = changedRadio.name === 'status_user' ? 'schedule_user' : 'status_user';
    const otherRadio = document.querySelector(`input[name="${targetName}"][value="${changedRadio.value}"]`);
    if (otherRadio) {
        otherRadio.checked = true;
    }
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
async function checkin(status) {
    const selectedUser = document.querySelector('input[name="status_user"]:checked');
    if (!selectedUser) { alert('「現在」の欄で名前を選択してください'); return; }
    const userId = selectedUser.value;
    try {
        await db.collection('logs').add({
            userId, status, timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert(`「${status}」で打刻しました。`);
        loadAllStatuses();
    } catch (error) {
        console.error("打刻エラー:", error);
        alert('打刻に失敗しました。');
    }
}

async function updateSchedule() {
    const selectedUser = document.querySelector('input[name="schedule_user"]:checked');
    if (!selectedUser) { alert('「在室予定を登録」の欄で名前を選択してください'); return; }
    const userId = selectedUser.value;
    const date = document.getElementById('schedule-date').value;
    const remarks = document.getElementById('schedule-remarks').value.trim();
    const startTime = `${document.getElementById('start-hour').value}:${document.getElementById('start-minute').value}`;
    const endTime = `${document.getElementById('end-hour').value}:${document.getElementById('end-minute').value}`;
    const scheduleTime = `${startTime}-${endTime}`;
    if (!date) { alert('日付を選択してください。'); return; }

    try {
        const querySnapshot = await db.collection('schedules').where('userId', '==', userId).where('date', '==', date).get();
        const scheduleData = { userId, date, time: scheduleTime, remarks: remarks || '' };
        if (querySnapshot.empty) {
            await db.collection('schedules').add(scheduleData);
        } else {
            const docId = querySnapshot.docs[0].id;
            await db.collection('schedules').doc(docId).update(scheduleData);
        }
        alert('予定を登録しました。');
        calendar.refetchEvents();
    } catch (error) {
        console.error("予定登録エラー:", error);
        alert('予定の登録に失敗しました。');
    }
}

// --- カレンダー関連 ---
async function fetchJapanHolidays() {
    if (Object.keys(japanHolidays).length > 0) return;
    try {
        const response = await fetch('https://holidays-jp.github.io/api/v1/date.json');
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        for (const dateStr in data) {
            const yearKey = new Date(dateStr).getFullYear();
            if (!japanHolidays[yearKey]) japanHolidays[yearKey] = {};
            japanHolidays[yearKey][dateStr] = data[dateStr];
        }
    } catch (error) {
        console.error("祝日の取得に失敗しました:", error);
    }
}

function initializeCalendar() {
    const calendarEl = document.getElementById('calendar');
    calendar = new FullCalendar.Calendar(calendarEl, {
        locale: 'ja',
        initialView: 'dayGridMonth',
        headerToolbar: {
            left: 'dayGridMonth,timeGridWeek',
            center: 'title',
            right: 'prev,today,next'
        },
        height: 'auto',
        slotMinTime: '08:00:00',
        slotMaxTime: '22:00:00',
        views: {
            timeGridWeek: { allDaySlot: false }
        },
        dayCellContent: function(arg) {
            return { html: arg.dayNumberText.replace('日', '') };
        },
        dayHeaderContent: function(arg) {
            const date = arg.date;
            const dayNum = date.getDate();
            const dayOfWeek = new Intl.DateTimeFormat('ja-JP', { weekday: 'short' }).format(date);
            if (window.innerWidth < 768) {
                return { html: `${dayNum}<br>${dayOfWeek}` };
            }
            return `${dayNum} (${dayOfWeek})`;
        },
        eventClick: async info => {
            const docId = info.event.extendedProps.firestoreId;
            if (!docId) return;
            const member = membersData[info.event.extendedProps.userId];
            const memberName = member ? `${member.lastname} ${member.firstname}` : '不明';
            if (confirm(`${memberName}さんのこの予定を削除しますか？`)) {
                try {
                    await db.collection('schedules').doc(docId).delete();
                    alert('予定を削除しました。');
                    calendar.refetchEvents();
                } catch (error) {
                    console.error("予定の削除に失敗:", error);
                    alert('削除に失敗しました。');
                }
            }
        },
        eventContent: function(arg) {
            const memberInfo = membersData[arg.event.extendedProps.userId];
            if (!memberInfo) return;
            let titleHtml = '';
            let classNames = arg.event.classNames.slice();
            const isMobile = window.innerWidth < 768;

            if (arg.view.type === 'dayGridMonth') {
                titleHtml = isMobile ? memberInfo.lastname : `${memberInfo.lastname} ${memberInfo.firstname}`;
            } else if (arg.view.type === 'timeGridWeek') {
                if (isMobile) {
                    titleHtml = '';
                } else {
                    titleHtml = `${memberInfo.lastname}<br>${memberInfo.firstname}`;
                    classNames.push('fc-event-vertical');
                }
            }
            if (arg.event.extendedProps.remarks) {
                titleHtml += `<span class="remarks-indicator">💬</span>`;
            }
            return { html: titleHtml, classNames: classNames };
        },
        eventDidMount: info => {
            if (info.event.extendedProps.remarks) {
                tippy(info.el, { content: info.event.extendedProps.remarks, placement: 'top' });
            }
        },
        datesSet: async (info) => {
            const year = info.view.currentStart.getFullYear();
            if (!japanHolidays[year]) {
                await fetchJapanHolidays();
                calendar.refetchEvents();
            }
        }
    });
    
    fetchJapanHolidays().then(() => {
        calendar.render();
    });
}

async function fetchCalendarEvents(fetchInfo, successCallback, failureCallback) {
    // ▼▼▼ デバッグコード ▼▼▼
    try {
        console.log("1. fetchCalendarEventsが実行されました。ビュータイプ:", fetchInfo.view.type);

        const schedulesSnapshot = await db.collection('schedules').get();
        console.log(`2. Firestoreから ${schedulesSnapshot.size} 件の予定データを取得しました。`);

        const events = [];
        schedulesSnapshot.docs.forEach(doc => {
            const schedule = doc.data();
            const memberInfo = membersData[schedule.userId];

            if (!memberInfo) {
                console.warn(`警告: 予定(ID: ${doc.id}) に一致するメンバー情報が見つかりません。スキップします。`);
                return;
            }

            const eventProps = { firestoreId: doc.id, userId: schedule.userId, remarks: schedule.remarks };
            
            if (fetchInfo.view.type === 'dayGridMonth') {
                events.push({
                    title: '',
                    start: schedule.date,
                    allDay: true,
                    backgroundColor: memberInfo.color,
                    borderColor: memberInfo.color,
                    extendedProps: eventProps
                });
            } else if (fetchInfo.view.type === 'timeGridWeek') {
                const [startTime, endTime] = schedule.time.split('-');
                if (startTime && endTime) {
                    events.push({
                        title: '',
                        start: `${schedule.date}T${startTime}`,
                        end: `${schedule.date}T${endTime}`,
                        backgroundColor: memberInfo.color,
                        borderColor: memberInfo.color,
                        extendedProps: eventProps
                    });
                } else {
                    console.warn(`警告: 予定(ID: ${doc.id}) の時間形式が正しくありません（time: "${schedule.time}"）。スキップします。`);
                }
            }
        });

        console.log("3. カレンダーに渡すイベント配列を作成しました。件数:", events.length, "内容:", events);
        successCallback(events);
    // ▲▲▲ デバッグコード ▲▲▲
    } catch (error) {
        console.error('Error fetching events:', error);
        failureCallback(error);
    }
}
