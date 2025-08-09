/* global React, ReactDOM, room, websim */
const { useState, useEffect, useMemo, useRef, useSyncExternalStore } = React;

function useCurrentUser() {
  const [user, setUser] = useState(null);
  useEffect(() => {
    let mounted = true;
    (async () => {
      const u = await window.websim.getCurrentUser();
      if (mounted) setUser(u);
    })();
    return () => { mounted = false; };
  }, []);
  return user;
}

function useRecords(type, filterObj = null) {
  // useSyncExternalStore with subscribe/getList as per docs.
  const subscribe = useMemo(() => {
    return filterObj ? room.collection(type).filter(filterObj).subscribe : room.collection(type).subscribe;
  }, [type, filterObj]);
  const getList = useMemo(() => {
    return filterObj ? room.collection(type).filter(filterObj).getList : room.collection(type).getList;
  }, [type, filterObj]);
  const list = useSyncExternalStore(subscribe, getList);
  return list || [];
}

function randomInt() {
  return Math.floor(Math.random()*1e9);
}

function typeColor(type) {
  const t = (type || "").toLowerCase();
  if (t.includes("fire")) return "linear-gradient(180deg, #ff7a59, #ef4444)";
  if (t.includes("water")) return "linear-gradient(180deg, #60a5fa, #3b82f6)";
  if (t.includes("grass") || t.includes("earth")) return "linear-gradient(180deg, #34d399, #10b981)";
  if (t.includes("electric")) return "linear-gradient(180deg, #fde047, #f59e0b)";
  if (t.includes("ice")) return "linear-gradient(180deg, #a5f3fc, #67e8f9)";
  if (t.includes("psychic")) return "linear-gradient(180deg, #a78bfa, #8b5cf6)";
  if (t.includes("ghost")) return "linear-gradient(180deg, #94a3b8, #64748b)";
  if (t.includes("dark")) return "linear-gradient(180deg, #475569, #0f172a)";
  if (t.includes("rock")) return "linear-gradient(180deg, #d4d4d4, #9ca3af)";
  return "linear-gradient(180deg, #6ee7ff, #6aa8ff)";
}

function Card({ card, actions, compact }) {
  const imgUrl = card.imageUrl || `https://picsum.photos/seed/${encodeURIComponent(card.name || 'poge')}/480/320`;
  return (
    <div className="card">
      <img alt={card.name} src={imgUrl} />
      <div className="meta">
        <div>
          <div style={{fontWeight:800, letterSpacing:'.3px'}}>{card.name}</div>
          <div className="small">by {card.username}</div>
        </div>
        <div className="type-chip" style={{background: typeColor(card.type)}}>{card.type}</div>
      </div>
      {!compact && card.created_at ? (
        <div className="small">Created {new Date(card.created_at).toLocaleString()}</div>
      ) : null}
      {actions ? <div className="card-actions">{actions}</div> : null}
    </div>
  );
}

function SectionHeader({ title, count, right }) {
  return (
    <div className="panel-header">
      <div className="panel-title">{title} <span className="badge">{count ?? 0}</span></div>
      <div>{right}</div>
    </div>
  );
}

function AppShell() {
  const [initialized, setInitialized] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [selectToShare, setSelectToShare] = useState(false);
  const user = useCurrentUser();
  const pogeFlexRef = useRef(null);

  useEffect(() => {
    (async () => {
      await room.initialize();

      // Optional: presence initial
      room.updatePresence({ ready: true });

      room.subscribePresence(() => {});
      room.subscribeRoomState(() => {});

      setInitialized(true);
    })();
  }, []);

  useEffect(() => {
    if (selectToShare && pogeFlexRef.current) {
      pogeFlexRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectToShare]);

  if (!initialized || !user) {
    return (
      <div className="app-shell">
        <div className="header"><div className="header-inner">
          <div className="brand"><div className="logo"></div> PoGemon • PoGePalace</div>
        </div></div>
        <div className="container"><div className="panel"><div className="hint">Connecting...</div></div></div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="header">
        <div className="header-inner">
          <div className="brand">
            <div className="logo"></div>
            <div>
              <div>PoGemon Card Generator</div>
              <div className="small">Welcome, {user.username}</div>
            </div>
          </div>
          <div className="header-actions">
            <GenerateButton />
            <button className="ghost" onClick={() => setSelectToShare(s => !s)}>
              {selectToShare ? "Cancel Share" : "Share Current Card"}
            </button>
            <button className="accent" onClick={() => setShowChat(true)}>Realtime Chat Room</button>
          </div>
        </div>
      </header>

      <main className="container">
        <div className="grid">
          <PoGeFlex refEl={pogeFlexRef} selecting={selectToShare} onSelected={() => setSelectToShare(false)} />
          <PoGePalace />
        </div>
      </main>

      {showChat ? <ChatRoom onClose={() => setShowChat(false)} /> : null}
    </div>
  );
}

/* Generate Button + LLM + Persistence */
function GenerateButton() {
  const user = useCurrentUser();
  const myCards = useRecords('poge_card', user ? { username: user.username } : null);
  const [loading, setLoading] = useState(false);
  const [last, setLast] = useState(null);

  useEffect(() => {
    // set last generated for prompt use (the newest item)
    if (myCards && myCards.length > 0) {
      setLast(myCards[0]);
    }
  }, [myCards]);

  async function generateUniqueCard(maxTries = 3) {
    setLoading(true);
    try {
      // Sample of user's existing collection names/types (up to 8 most recent)
      const sample = (myCards || []).slice(0, 8).map(c => ({ name: c.name, type: c.type }));

      for (let attempt = 0; attempt < maxTries; attempt++) {
        const r = randomInt();
        const completion = await websim.chat.completions.create({
          messages: [
            {
              role: "system",
              content:
`You are the PoGemon Master Generator.
Return ONLY JSON matching:
{
  "name": string, // unique, fun, readable, camel/studly case without spaces, 3-20 chars, avoid punctuation
  "type": string  // a single elemental-like type word (e.g., Fire, Water, Grass, Electric, Ice, Rock, Psychic, Dark, Ghost, Fairy, Steel, Dragon)
}
DO NOT reuse the last card or any in the user's sample. No duplicates. No surrounding text.`
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text:
`Generate a new PoGemon card that is different from the last card and from my collection sample.

Randomness number: ${r}
Last card (may be null):
${JSON.stringify(last ? { name: last.name, type: last.type } : null, null, 2)}

Sample of my PoGeFlex (avoid duplicates):
${JSON.stringify(sample, null, 2)}`
                }
              ]
            }
          ],
          json: true
        });

        let result = {};
        try { result = JSON.parse(completion.content); } catch(e) {
          // If the model failed to return valid JSON, try again with a new randomness
          continue;
        }

        // Local uniqueness checks
        const name = String(result.name || "").trim();
        const type = String(result.type || "").trim();
        if (!name || !type) continue;
        if (last && last.name === name && last.type === type) continue;
        const exists = (myCards || []).some(c => c.name === name && c.type === type);
        if (exists) continue;

        // Optional: image prompt – keep external URL (no base64)
        // We'll use a deterministic placeholder image for now to keep it fast.
        const imageUrl = `https://picsum.photos/seed/${encodeURIComponent(name)}/640/400`;

        const rec = await room.collection('poge_card').create({
          name,
          type,
          imageUrl
        });

        setLoading(false);
        return rec;
      }

      setLoading(false);
      alert("Couldn't generate a unique card after several attempts. Try again.");
      return null;
    } catch (err) {
      console.error(err);
      setLoading(false);
      alert("Error generating card.");
      return null;
    }
  }

  return (
    <button className="success" onClick={generateUniqueCard} disabled={loading}>
      {loading ? "Generating..." : "Generate Card"}
    </button>
  );
}

/* PoGeFlex: user's collection, share to palace */
function PoGeFlex({ refEl, selecting, onSelected }) {
  const user = useCurrentUser();
  const myCards = useRecords('poge_card', user ? { username: user.username } : null);

  async function shareToPalace(card) {
    await room.collection('palace_share').create({
      card_id: card.id,
      name: card.name,
      type: card.type,
      imageUrl: card.imageUrl
    });
    if (onSelected) onSelected();
  }

  return (
    <section ref={refEl} className={`panel ${selecting ? 'selecting-hint' : ''}`}>
      <SectionHeader
        title="Your PoGeFlex"
        count={myCards.length}
        right={<span className="hint">Your private collection. Click "Share Current Card" to select one to share.</span>}
      />
      {myCards.length === 0 ? (
        <div className="empty">No cards yet. Click “Generate Card” to create your first PoGemon!</div>
      ) : (
        <div className="list">
          {myCards.map(card => (
            <Card
              key={card.id}
              card={card}
              actions={
                selecting ? (
                  <button className="accent" onClick={() => shareToPalace(card)}>Share to PoGePalace</button>
                ) : (
                  <>
                    <ShareLinkButton card={card} />
                    <CopyLinkButton card={card} />
                  </>
                )
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

/* PoGePalace: global shared feed */
function PoGePalace() {
  const shares = useRecords('palace_share', null);

  return (
    <section className="panel">
      <SectionHeader
        title="PoGePalace • Shared by All"
        count={shares.length}
        right={<span className="hint">A shared hall of fame distinct from your PoGeFlex.</span>}
      />
      {shares.length === 0 ? (
        <div className="empty">No cards have been shared yet. Be the first to share from your PoGeFlex!</div>
      ) : (
        <div className="list">
          {shares.map(share => (
            <Card
              key={share.id}
              card={{
                ...share,
                // Ensure username of the sharer displays
                username: share.username
              }}
              actions={<OpenInChatButton card={share} />}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/* Deep link helpers */
function ShareLinkButton({ card }) {
  const url = `${window.baseUrl || (window.location.origin + window.location.pathname)}?recordType=poge_card&recordId=${encodeURIComponent(card.id)}`;
  return (
    <a className="btn" href={url} target="_self" rel="noreferrer">Open Link</a>
  );
}
function CopyLinkButton({ card }) {
  const url = `${window.baseUrl || (window.location.origin + window.location.pathname)}?recordType=poge_card&recordId=${encodeURIComponent(card.id)}`;
  async function copy() {
    await navigator.clipboard.writeText(url);
  }
  return <button className="ghost" onClick={copy}>Copy Link</button>;
}
function OpenInChatButton({ card }) {
  async function sendToChat() {
    await room.collection('chat_message').create({
      message: `Check out ${card.name}!`,
      attached_card_id: card.card_id || card.id,
      attached_card_snapshot: {
        name: card.name, type: card.type, imageUrl: card.imageUrl
      }
    });
    alert("Shared into chat room!");
  }
  return <button onClick={sendToChat}>Share in Chat</button>;
}

/* Chat Room Modal */
function ChatRoom({ onClose }) {
  const [text, setText] = useState("");
  const user = useCurrentUser();
  const myCards = useRecords('poge_card', user ? { username: user.username } : null);
  const messages = useRecords('chat_message', null);
  const [attachId, setAttachId] = useState(null);

  const attachCard = myCards.find(c => c.id === attachId) || null;

  async function sendMessage() {
    if (!text && !attachCard) return;
    await room.collection('chat_message').create({
      message: text,
      attached_card_id: attachCard ? attachCard.id : null,
      attached_card_snapshot: attachCard ? {
        name: attachCard.name,
        type: attachCard.type,
        imageUrl: attachCard.imageUrl
      } : null
    });
    setText("");
    setAttachId(null);
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <header>
          <div className="row">
            <strong>Realtime Chat Room</strong>
            <span className="badge">{Object.keys(room.peers || {}).length} online</span>
          </div>
          <button className="ghost" onClick={onClose}>Close</button>
        </header>
        <div className="chat-body">
          <aside className="chat-sidebar">
            <div className="panel-title" style={{marginBottom:10}}>Your Cards</div>
            {myCards.length === 0 ? <div className="empty">Generate a card to share it here.</div> : null}
            <div style={{display:'grid', gap:8}}>
              {myCards.map(c => (
                <button
                  key={c.id}
                  className={`ghost`}
                  style={{textAlign:'left', borderColor: attachId === c.id ? 'var(--accent)' : 'var(--border)'}}
                  onClick={() => setAttachId(prev => prev === c.id ? null : c.id)}
                >
                  <div style={{display:'flex', alignItems:'center', gap:8}}>
                    <img src={c.imageUrl || `https://picsum.photos/seed/${encodeURIComponent(c.name)}/160/100`} alt="" style={{width:44, height:28, objectFit:'cover', borderRadius:6}} />
                    <div>
                      <div style={{fontWeight:700}}>{c.name}</div>
                      <div className="small">{c.type}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </aside>
          <section className="chat-main">
            <div className="chat-messages">
              {messages.map(m => (
                <div key={m.id} className="msg" style={{alignSelf: m.username === user.username ? 'flex-end' : 'flex-start'}}>
                  <div className="by">
                    <img className="avatar" src={`https://images.websim.com/avatar/${m.username}`} alt="" />
                    {m.username} • {new Date(m.created_at).toLocaleTimeString()}
                  </div>
                  {m.message ? <div className="content">{m.message}</div> : null}
                  {m.attached_card_snapshot ? (
                    <div className="card" style={{marginTop:8}}>
                      <img alt={m.attached_card_snapshot.name} src={m.attached_card_snapshot.imageUrl || `https://picsum.photos/seed/${encodeURIComponent(m.attached_card_snapshot.name)}/480/320`} />
                      <div className="meta">
                        <div style={{fontWeight:800}}>{m.attached_card_snapshot.name}</div>
                        <div className="type-chip" style={{background: typeColor(m.attached_card_snapshot.type)}}>{m.attached_card_snapshot.type}</div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="chat-input">
              <input
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder={attachCard ? `Message (attached: ${attachCard.name})` : "Type your message..."}
                style={{flex:1, padding:'10px 12px', borderRadius:10, border:'1px solid var(--border)', background:'#0c1424', color:'var(--text)'}}
              />
              <button onClick={sendMessage} className="accent">Send</button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/* Mount app and handle deeplinks */
function Root() {
  // Read URL params for deep link to a specific card
  const params = new URLSearchParams(window.location.search);
  const recordType = params.get('recordType');
  const recordId = params.get('recordId');
  const [target, setTarget] = useState(null);

  useEffect(() => {
    if (!recordType || !recordId) return;
    // Subscribe to specific item’s list then focus it visually by adding to room.state
    const unsub = room.collection(recordType).subscribe(list => {
      const found = (list || []).find(x => x.id === recordId);
      setTarget(found || null);
    });
    return () => unsub && unsub();
  }, [recordType, recordId]);

  return (
    <>
      <AppShell />
      {/* Optional floating preview for deep-linked card */}
      {target ? (
        <div style={{position:'fixed', right:16, bottom:16, width:320, zIndex:50}}>
          <div className="panel">
            <div className="panel-title">Linked Card</div>
            <Card card={target} />
          </div>
        </div>
      ) : null}
    </>
  );
}

ReactDOM.createRoot(document.getElementById('app')).render(<Root />);

