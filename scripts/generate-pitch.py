"""Regenerate the shared-content executive PDF and its public download payload.
Usage: python scripts/generate-pitch.py --fonts /path/to/fonts --screenshots /path/to/captures
Requires reportlab and Pillow locally; never runs in the app server.
"""
import argparse, json
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from PIL import Image

args=argparse.ArgumentParser(); args.add_argument('--fonts',required=True); args.add_argument('--screenshots',required=True); a=args.parse_args()
ROOT=Path(__file__).resolve().parents[1]; p=json.loads((ROOT/'frontend/src/content/pitch.json').read_text()); F=Path(a.fonts); S=Path(a.screenshots)
for name,file in [('Body','InstrumentSans-Regular.ttf'),('Bold','InstrumentSans-Bold.ttf'),('Mono','GeistMono-Regular.ttf')]: pdfmetrics.registerFont(TTFont(name,str(F/file)))
W,H=1280,720
C={k:HexColor(v) for k,v in {'bg':'#080C12','panel':'#141B25','ink':'#F4F7FA','muted':'#B5BEC9','line':'#313E4B','blue':'#489EFF','cyan':'#15CEDA','green':'#38D5A0','amber':'#FFC768'}.items()}
out=ROOT/'frontend/public/downloads/synchoo-enterprise-pitch.pdf'; out.parent.mkdir(parents=True,exist_ok=True)
c=canvas.Canvas(str(out),pagesize=(W,H)); c.setTitle('Synchoo — Executive proposal'); c.setAuthor('Synchoo'); c.setSubject('Verified product overview and proposed controlled pilot')
page=0

def rect(x,y,w,h,color):
 c.setFillColor(C[color]); c.rect(x,H-y-h,w,h,stroke=0,fill=1)
def line(x,y,x2,y2,color='line',width=1):
 c.setStrokeColor(C[color]); c.setLineWidth(width); c.line(x,H-y,x2,H-y2)
def text(s,x,y,size=18,color='ink',font='Body'):
 c.setFillColor(C[color]); c.setFont(font,size); c.drawString(x,H-y-size,s)
def para(s,x,y,w,size=20,color='muted',font='Body',maxh=160):
 st=ParagraphStyle('p',fontName=font,fontSize=size,leading=size*1.36,textColor=C[color])
 ob=Paragraph(escape(s),st); _,h=ob.wrap(w,maxh)
 if h>maxh: raise ValueError(f'Text exceeds region: {s[:70]} {h}>{maxh}')
 ob.drawOn(c,x,H-y-h); return h

def start(kicker,title=None,subtitle=None):
 global page; page+=1
 rect(0,0,W,H,'bg'); text('Synchoo',56,26,20,'ink','Bold'); text('EXECUTIVE PROPOSAL',870,34,11,'muted','Mono'); line(56,69,1224,69)
 text(kicker.upper(),56,103,12,'cyan','Mono')
 if title: para(title,56,136,1160,40,'ink','Bold',120)
 if subtitle: para(subtitle,56,239,1100,18,maxh=75)
 line(56,667,1224,667); text('PRODUCT OVERVIEW  /  PROPOSED PILOT',56,684,10,'muted','Mono'); text(f'{page:02d}',1194,681,14,'cyan','Mono')
def end(): c.showPage()
def block(x,y,w,n,title,body,color='blue',h=246):
 line(x,y,x+w,y,color,3); text(n,x,y+19,12,color,'Mono'); para(title,x,y+52,w,25,'ink','Bold',80); para(body,x,y+131,w,18,maxh=h-130)
def node(x,y,w,h,title,detail,color='blue'):
 rect(x,y,w,h,'panel'); rect(x,y,4,h,color); para(title,x+20,y+18,w-40,21,'ink','Bold',65); para(detail,x+20,y+80,w-40,17,maxh=h-86)
def arrow(x,y,x2,y2,color='cyan'):
 line(x,y,x2,y2,color,2); import math
 ang=math.atan2(y2-y,x2-x)
 for delta in [-.55,.55]: line(x2,y2,x2-11*math.cos(ang+delta),y2-11*math.sin(ang+delta),color,2)
def image(path,x,y,w,h):
 im=Image.open(path); iw,ih=im.size; scale=min(w/iw,h/ih); dw,dh=iw*scale,ih*scale
 c.drawImage(str(path),x+(w-dw)/2,H-y-dh,width=dw,height=dh,mask='auto')

start('Strategic product brief')
text(p['executive']['headline'],56,172,86,'ink','Bold')
para(p['executive']['offer'],60,293,725,40,'ink','Bold',125)
para(p['executive']['thesis'],60,451,700,23,maxh=100)
# Connected service tracks: a quiet reference to the paired-wheel wordmark.
for i,(label,color) in enumerate([('RENT','blue'),('HIRE','cyan'),('POOL','green'),('CARE','amber')]):
 yy=230+i*82; line(863,yy,1200,yy,color,3); c.setStrokeColor(C[color]); c.circle(877,H-yy,12,stroke=1,fill=0); c.circle(1190,H-yy,12,stroke=1,fill=0); text(label,923,yy-29,14,color,'Mono')
text(p['executive']['audience'],60,601,14); end()

start('01 / Executive case','A shared operating layer. Distinct service journeys.',p['summary'])
for i,s in enumerate(p['value']): block(56+i*399,350,360,f'0{i+1}',s['title'],s['detail'],['blue','cyan','green'][i],280)
end()
start('02 / The operating problem','Fragmented journeys create operational gaps.')
for i,s in enumerate(p['positioning']): block(56+i*399,293,360,f'0{i+1}',['Discovery is scattered','Trust loses context','Operations stay separate'][i],s,['blue','cyan','amber'][i],285)
text('DESIGN RESPONSE',56,611,12,'cyan','Mono'); text('Connect the record. Preserve the workflow.',260,601,25,'ink','Bold'); end()

start('03 / Product ecosystem','Four service lines, one connected foundation.')
for i,s in enumerate(p['services']): node(56+i*299,269,269,240,s['title'],s['detail'],['blue','cyan','green','amber'][i])
for i in range(4): arrow(190+i*299,521,190+i*299,555)
rect(56,568,1168,66,'panel'); text('ACCOUNT',82,590,15,'cyan','Mono'); text('VERIFICATION  /  PAYMENTS  /  COMMUNICATION  /  EVIDENCE',258,590,16,'ink','Mono'); end()

start('04 / Product in view','A service-first experience, with role-aware operations.')
# Capture omits customer records; public service navigation only.
shot=S/'product-services.png'
if shot.exists():
 im=Image.open(shot); im.crop((0,0,im.width,min(im.height,270))).save(S/'services-crop.png'); image(S/'services-crop.png',56,252,1168,297)
para('Customer, host, driver and administrator experiences connect service discovery to booking records and trip operations.',56,566,1140,24,'ink',maxh=85)
text('CURRENT PRODUCT UI • NOT CUSTOMER ADOPTION EVIDENCE',56,638,10,'muted','Mono'); end()

start('05 / Rental journey','From an available vehicle to an evidence-backed trip.')
for i,s in enumerate(p['rentalLifecycle']):
 col=i%4; row=i//4; x=56+col*299; y=271+row*182
 line(x,y,x+262,y,'blue' if row==0 else 'cyan',3); text(f'{i+1:02d}',x,y+14,14,'cyan','Mono'); para(s,x,y+47,260,18,maxh=107)
 if col<3 and i<6: arrow(x+268,y+80,x+291,y+80)
text('HANDOVER CONFIRMS THE EXCHANGE; IT DOES NOT REMOTELY UNLOCK A VEHICLE.',56,638,10,'muted','Mono'); end()

start('06 / Operating model','Five participants. Clear responsibilities.')
for i,s in enumerate(p['roles']):
 x=56+(i%3)*399; y=267+(i//3)*188
 line(x,y,x+360,y,['blue','cyan','green','amber','blue'][i],2); text(s['title'],x,y+20,24,'ink','Bold'); para(s['detail'],x,y+68,357,18,maxh=107)
end()

start('07 / Architecture','An application stack built around protected workflows.')
for i,s in enumerate(p['architecture']):
 yy=261+i*89; rect(56,yy,1168,72,'panel'); text(s['layer'],78,yy+20,22,'cyan','Bold'); para(s['detail'],301,yy+20,895,20,maxh=45)
 if i<3: arrow(1180,yy+73,1180,yy+87)
text('SCALING REQUIRES CAPACITY TESTS, COMPLETE PAGINATION AND OPERATIONAL MONITORING.',56,638,10,'muted','Mono'); end()

start('08 / Trust by design','The booking record anchors access and evidence.')
for i,s in enumerate(p['trust']):
 x=56+(i%2)*598; y=262+(i//2)*127
 text(f'{i+1:02d}',x,y,16,'cyan','Mono'); para(s,x+49,y,515,21,'ink',maxh=91); line(x,y+108,x+555,y+108)
end()

start('09 / Value and evaluation','Define success before increasing exposure.','Illustrative pilot measures below are proposed evaluation criteria—not measured performance or commercial forecasts.')
for i,s in enumerate(p['value']):
 block(56+i*399,350,360,f'0{i+1}',s['title'],s['measure'],['blue','cyan','green'][i],260)
end()

start('10 / Delivery maturity','Implemented capabilities are not a launch certificate.')
for i,s in enumerate(p['readiness']): block(56+i*399,272,360,f'0{i+1}',s['label'],s['detail'],['green','cyan','amber'][i],325)
para('No traction, revenue, market-size or customer-adoption claims are made. Repository evidence does not replace deployed acceptance testing.',56,586,1140,18,maxh=65); end()

start('11 / Proposed release gates','Validate the foundations before the pilot opens.')
for i,s in enumerate(p['launchGates']):
 x=56+(i%2)*598; y=263+(i//2)*183
 line(x,y,x+555,y,['blue','cyan','green','amber'][i],3); text(s['title'],x,y+18,24,'ink','Bold'); para(s['detail'],x,y+69,550,18,maxh=104)
end()

start('12 / Decision brief',p['decision']['title'],p['decision']['detail'])
for i,s in enumerate(p['decision']['steps']):
 x=56+i*299; text(f'0{i+1}',x,348,44,'cyan','Mono'); para(s,x,423,269,23,'ink','Bold',110)
text('REVIEW THE PRODUCT AND ALIGN THE PILOT',56,573,12,'cyan','Mono'); text(p['decision']['url'],56,603,24,'ink','Bold'); c.linkURL(p['decision']['url'],(56,H-639,725,H-596),relative=0); end()

start('Appendix / Evidence boundary','A disciplined distinction between current and proposed.')
for i,s in enumerate(p['caveats']):
 yy=263+i*85; text(f'{i+1:02d}',56,yy,14,'cyan','Mono'); para(s,108,yy,1095,18,maxh=76)
end(); c.save()
print(f'Generated {page} pages, {out.stat().st_size} bytes')
