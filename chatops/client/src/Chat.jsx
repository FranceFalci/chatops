import React from 'react'

function Toast({ type, message, onClose }) {
  if (!message) return null
  const bg = type === 'error' ? '#fee' : '#efe'
  const color = type === 'error' ? '#900' : '#060'
  return (
    <div style={{ position: 'fixed', bottom: 16, right: 16, background: bg, border: `1px solid ${color}`, padding: '8px 12px', borderRadius: 6 }}>
      <span style={{ color }}>{message}</span>
      <button style={{ marginLeft: 8 }} onClick={onClose}>x</button>
    </div>
  )
}

export default function Chat({ userId }) {
  const [messages, setMessages] = React.useState([
    { from: 'bot', text: 'Hola 👋 Decime qué necesitás.' }
  ])
  const [text, setText] = React.useState('')
  const [pendingApproval, setPendingApproval] = React.useState(null)
  const [toast, setToast] = React.useState({ type: 'info', message: '' })

  const placeholders = [
    'crear usuario Ana Gomez...',
    
  ]

  const placeholder = React.useMemo(() => placeholders[Math.floor(Math.random()*placeholders.length)], [])

  async function sendText() {
    const t = text.trim()
    if (!t) return
    setMessages(m => [...m, { from: 'user', text: t }])
    setText('')
    try {
      const resp = await fetch('/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: t, userId })
      })
      const data = await resp.json()
      if (data.requiresApproval) {
        setPendingApproval(data.payload)
        setMessages(m => [...m, { from: 'bot', text: data.message }])
      } else if (data.ok) {
        setMessages(m => [...m, { from: 'bot', text: data.message }])
        setToast({ type: 'success', message: 'Operación realizada' })
        setTimeout(() => setToast({ type: 'info', message: '' }), 3000)
      } else {
        setMessages(m => [...m, { from: 'bot', text: data.message || 'Error' }])
        setToast({ type: 'error', message: data.message || 'Error' })
      }
    } catch (e) {
      setMessages(m => [...m, { from: 'bot', text: 'Error de red' }])
      setToast({ type: 'error', message: 'Error de red' })
    }
  }

  async function confirmAction() {
    if (!pendingApproval) return
    try {
      const resp = await fetch('/chat/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ payload: pendingApproval, userId })
      })
      const data = await resp.json()
      if (data.ok) {
        setMessages(m => [...m, { from: 'bot', text: data.message }])
        setToast({ type: 'success', message: 'Confirmado' })
      } else {
        setMessages(m => [...m, { from: 'bot', text: data.message || 'Error' }])
        setToast({ type: 'error', message: data.message || 'Error' })
      }
    } catch (e) {
      setToast({ type: 'error', message: 'Error de red' })
    } finally {
      setPendingApproval(null)
      setTimeout(() => setToast({ type: 'info', message: '' }), 3000)
    }
  }

  return (
    <div>
      <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, height: '60vh', overflow: 'auto', marginBottom: 12, background: '#fafafa' }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.from === 'user' ? 'flex-end' : 'flex-start', margin: '6px 0' }}>
            <div style={{ maxWidth: '70%', padding: '8px 12px', borderRadius: 12, background: m.from === 'user' ? '#dcf8c6' : '#fff', border: '1px solid #e5e5e5' }}>
              {m.text}
            </div>
          </div>
        ))}
      </div>

      {pendingApproval && (
        <div style={{ border: '1px solid #f0c36d', background: '#fff8e1', padding: 12, borderRadius: 8, marginBottom: 12 }}>
          <strong>⚠️ Esta acción requiere confirmación</strong>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(pendingApproval, null, 2)}</pre>
          <button onClick={confirmAction} style={{ background: '#f57c00', color: '#fff', border: 0, padding: '8px 12px', borderRadius: 6 }}>Confirmar</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #ccc' }}
          placeholder={placeholder}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') sendText() }}
        />
        <button onClick={sendText} style={{ padding: '10px 16px', borderRadius: 8, background: '#1976d2', color: '#fff', border: 0 }}>Enviar</button>
      </div>

      <Toast type={toast.type} message={toast.message} onClose={() => setToast({ type: 'info', message: '' })} />
    </div>
  )
}

