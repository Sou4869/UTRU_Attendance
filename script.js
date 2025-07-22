const GAS_URL = 'YOUR_GAS_WEB_APP_URL'; // 先ほどコピーしたGASのURLを貼り付けます

// 画面ロード時にデータを取得・表示
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    // 日付入力のデフォルトを今日にする
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    document.getElementById('schedule-date').value = `${yyyy}-${mm}-${dd}`;
});

// GASから最新のデータを取得して画面に反映する関数
async function loadData() {
    const response = await fetch(GAS_URL);
    const data = await response.json();
    
    const userSelect = document.getElementById('user-select');
    userSelect.innerHTML = '';
    const tableBody = document.querySelector('#status-table tbody');
    tableBody.innerHTML = '';

    data.members.forEach(member => {
        // ユーザー選択プルダウンの作成
        const option = document.createElement('option');
        option.value = member.id;
        option.textContent = member.name;
        userSelect.appendChild(option);
        
        // 状況テーブルの作成
        const row = tableBody.insertRow();
        row.innerHTML = `
            <td>${member.name}</td>
            <td>${member.currentStatus.status} <span class="timestamp">(${new Date(member.currentStatus.timestamp).toLocaleString('ja-JP')})</span></td>
            <td>${member.todaySchedule}</td>
        `;
    });
}

// 打刻データをGASに送信する関数
async function checkin(status) {
    const userId = document.getElementById('user-select').value;
    if (!userId) {
        alert('ユーザーを選択してください');
        return;
    }
    
    const response = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: JSON.stringify({ action: 'checkin', userId: userId, status: status })
    });
    
    await response.json();
    loadData(); // データを再読み込みして画面を更新
}

// 予定データをGASに送信する関数
async function updateSchedule() {
    const userId = document.getElementById('user-select').value;
    const date = document.getElementById('schedule-date').value;
    const schedule = document.getElementById('schedule-text').value;

    if (!userId || !date || !schedule) {
        alert('すべての項目を入力してください');
        return;
    }
    
    const response = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: JSON.stringify({ action: 'updateSchedule', userId, date, schedule })
    });

    await response.json();
    alert('予定を登録しました');
    loadData(); // データを再読み込みして画面を更新
}
