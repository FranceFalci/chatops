import React from 'react'
import Chat from './Chat.jsx'

export default function App() {
  const [userId, setUserId] = React.useState('helpdesk')

  return (
    <div style={{ fontFamily: 'system-ui, Arial, sans-serif', padding: 16 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>ChatOps Local</h2>
        <span style={{ padding: '2px 8px', background: '#eef', borderRadius: 8, fontSize: 12 }}>Backend: http://localhost:3001</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 12 }}>Usuario:</label>
          <select value={userId} onChange={e => setUserId(e.target.value)}>
            <option value="helpdesk">helpdesk (HelpDesk)</option>
            <option value="admin">admin (Admin)</option>
          </select>
        </div>
      </header>
      <Chat userId={userId} />
    </div>
  )
}

