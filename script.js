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
        membersData[doc.id] = { name: member.name, color: member.color || '#3788d8' };
        
        // 「現在」用と「予定登録」用に2つラジオボタンセットを作成
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

            const label = document.createElement('label');
            label.htmlFor = radioId;
            label.textContent = member.name;

            wrapper.appendChild(input);
            wrapper.appendChild(label);
            group.container.appendChild(wrapper);
        });
    });
}

// --- データ書き込み (Firestore) ---
async function checkin(status) {
    const selectedUser = document.querySelector('input[name="status_user"]:checked');
    if (!selectedUser) { alert('「現在」の欄で名前を選択してください'); return; }
    // ... (以降のロジックは変更なし)
}

async function updateSchedule() {
    const selectedUser = document.querySelector('input[name="schedule_user"]:checked');
    if (!selectedUser) { alert('「在室予定を登録」の欄で名前を選択してください'); return; }
    // ... (以降のロジックは変更なし)
}

// --- カレンダー関連 ---

// 日本の祝日を取得
async function fetchJapanHolidays() {
    const year = new Date().getFullYear();
    if (japanHolidays[year]) return; // キャッシュがあれば何もしない

    try {
        const response = await fetch(`https://holidays-jp.github.io/api/v1/${year}/date.json`);
        const data = await response.json();
        japanHolidays[year] = data;
        // 来年の分も先読み
        const nextResponse = await fetch(`https://holidays-jp.github.io/api/v1/${year + 1}/date.json`);
        const nextData = await nextResponse.json();
        japanHolidays[year + 1] = nextData;
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
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek'
        },
        height: 'auto', // スマホ表示で内部スクロールをなくす
        views: {
            timeGridWeek: {
                allDayText: 'メンバー',
                dayHeaderFormat: { day: 'numeric' } // 週表示の日付を数字のみに
            }
        },
        dayCellClassNames: function(arg) {
            if (japanHolidays[arg.date.getFullYear()] && japanHolidays[arg.date.getFullYear()][formatDate(arg.date)]) {
                return ['fc-holiday']; // 祝日クラスを付与
            }
            return [];
        },
        eventClick: async function(info) {
            // イベントクリックで予定を削除
            const docId = info.event.extendedProps.firestoreId;
            if (!docId) return;

            const memberName = membersData[info.event.extendedProps.userId]?.name || '不明';
            if (confirm(`${memberName}さんのこの予定を削除しますか？`)) {
                try {
                    await db.collection('schedules').doc(docId).delete();
                    alert('予定を削除しました。');
                    calendar.refetchEvents();
                } catch (error) {
                    console.error("予定の削除に失敗しました:", error);
                    alert('削除に失敗しました。');
                }
            }
        },
        eventContent: function(arg) {
            // イベントの見た目をカスタマイズ
            let titleHtml = `<span>${arg.event.title}</span>`;
            if (arg.event.extendedProps.remarks) {
                titleHtml += `<span class="remarks-indicator">💬</span>`;
            }
            return { html: titleHtml };
        },
        eventDidMount: function(info) {
            // 備考ツールチップ表示
            if (info.event.extendedProps.remarks) {
                tippy(info.el, { content: info.event.extendedProps.remarks });
            }
        },
        events: fetchCalendarEvents
    });
    calendar.render();
    fetchJapanHolidays().then(() => calendar.rerender()); // 初期描画後、祝日を反映
}


async function fetchCalendarEvents(fetchInfo, successCallback, failureCallback) {
    try {
        const schedulesSnapshot = await db.collection('schedules').get();
        const events = [];
        
        schedulesSnapshot.docs.forEach(doc => {
            const schedule = doc.data();
            const memberInfo = membersData[schedule.userId];
            if (!memberInfo) return;

            const eventProps = {
                firestoreId: doc.id,
                userId: schedule.userId,
                remarks: schedule.remarks
            };

            // 月表示
            if (calendar.view.type === 'dayGridMonth') {
                events.push({
                    title: memberInfo.name,
                    start: schedule.date,
                    allDay: true,
                    backgroundColor: memberInfo.color,
                    borderColor: memberInfo.color,
                    extendedProps: eventProps
                });
            }
            
            // 週表示
            if (calendar.view.type === 'timeGridWeek') {
                // All-day欄の名前
                events.push({
                    title: memberInfo.name,
                    start: schedule.date,
                    allDay: true,
                    backgroundColor: memberInfo.color,
                    borderColor: memberInfo.color,
                    extendedProps: eventProps
                });

                // 時間グリッドの棒
                const [startTime, endTime] = schedule.time.split('-');
                if (startTime && endTime) {
                    events.push({
                        title: memberInfo.name,
                        start: `${schedule.date}T${startTime}`,
                        end: `${schedule.date}T${endTime}`,
                        backgroundColor: memberInfo.color,
                        borderColor: memberInfo.color,
                        extendedProps: eventProps
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
