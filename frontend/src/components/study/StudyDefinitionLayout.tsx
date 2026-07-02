/**
 * Shared sidebar layout for Study Definition pages FS14–FS21
 * Tabs: Study | Groups | Animals | Trial Summary | Trial Element | Trial Arm | Trial Set | Dosing Specifications
 */
import { ReactNode } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'

const TABS = [
  { label: 'Study',               path: 'study'         },
  { label: 'Groups',              path: 'groups'        },
  { label: 'Animals',             path: 'animals'       },
  { label: 'Trial Summary',       path: 'trial-summary' },
  { label: 'Trial Element',       path: 'trial-element' },
  { label: 'Trial Arm',           path: 'trial-arm'     },
  { label: 'Trial Set',           path: 'trial-set'     },
  { label: 'Dosing Specifications', path: 'dosing'      },
]

export default function StudyDefinitionLayout({ title, children }: { title: string; children: ReactNode }) {
  const navigate  = useNavigate()
  const { id }    = useParams<{ id: string }>()
  const location  = useLocation()
  const activeTab = location.pathname.split('/').pop() ?? 'study'

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'#f0f4f8' }}>

      {/* Sidebar */}
      <aside style={{ width:158, flexShrink:0, background:'#cfe0f0', borderRight:'1px solid #b8d0e8' }}>
        {TABS.map(tab => {
          const active = activeTab === tab.path
          return (
            <button key={tab.path}
              onClick={() => navigate(`/studies/${id}/define/${tab.path}`)}
              style={{
                display:'block', width:'100%', textAlign:'left',
                padding:'11px 16px', fontSize:13,
                fontWeight: active ? 600 : 400,
                color: active ? '#1e3a6e' : '#1e40af',
                background: active ? 'white' : 'transparent',
                border:'none', borderBottom:'1px solid #b8d0e8',
                cursor:'pointer', position:'relative',
                transition:'background 0.1s',
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background='#b8d4ea' }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background='transparent' }}
            >
              {tab.label}
              {/* Arrow indicator for active tab */}
              {active && (
                <span style={{
                  position:'absolute', right:-12, top:'50%', transform:'translateY(-50%)',
                  width:0, height:0,
                  borderTop:'12px solid transparent',
                  borderBottom:'12px solid transparent',
                  borderLeft:'12px solid white',
                  zIndex:5,
                }}/>
              )}
            </button>
          )
        })}
      </aside>

      {/* Main */}
      <main style={{ flex:1, padding:'24px 32px' }}>
        <h1 style={{ textAlign:'center', fontSize:17, fontWeight:500, color:'#374151', marginBottom:24 }}>
          {title}
        </h1>
        {children}
      </main>
    </div>
  )
}
