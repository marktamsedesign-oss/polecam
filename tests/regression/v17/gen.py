"""Fake camera videos (720x1280 MJPEG) for the browser tests."""
import sys, io, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np
import os
F = next((f for f in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/Library/Fonts/Arial Bold.ttf', 'C:/Windows/Fonts/arialbd.ttf') if os.path.exists(f)), None)  # DejaVu Sans Bold (as made); another bold font elsewhere
def _font(size): return ImageFont.truetype(F, size) if F else ImageFont.load_default(size)
def scene(seed=1):
    rng=np.random.default_rng(seed)
    a=np.zeros((1280,720,3),float)
    a[:1000]=[150,188,226]; a[1000:]=[72,104,58]
    a+=rng.normal(0,6,a.shape)                      # sensor grain
    a[1000:]+=rng.normal(0,18,(280,720,3))          # grass texture
    im=Image.fromarray(np.clip(a,0,255).astype('uint8'))
    d=ImageDraw.Draw(im)
    return im,d
def pole(im,d,x0,x1,seed=2):
    rng=np.random.default_rng(seed)
    a=np.array(im).astype(float)
    a[:,x0:x1]=[128,126,120]; a[:,x0:x1]+=rng.normal(0,10,(1280,x1-x0,3))
    im2=Image.fromarray(np.clip(a,0,255).astype('uint8')); d2=ImageDraw.Draw(im2)
    d2.line([(0,200),(720,260)],fill=(25,25,25),width=5); d2.line([(0,330),(720,390)],fill=(25,25,25),width=5)
    return im2,d2
def text_h(im,d,t,cy=650,size=88):
    f=_font(size); w=d.textlength(t,font=f); d.text(((720-w)/2,cy-size*0.6),t,font=f,fill=(240,240,232))
def text_stack(im,d,t,top=230,size=82,step=94):
    f=_font(size)
    for i,ch in enumerate(t):
        w=d.textlength(ch,font=f); d.text((360-w/2,top+i*step),ch,font=f,fill=(240,240,232))
def text_rot(im,t,size=86,angle=90):
    f=_font(size); tmp=Image.new('RGBA',(760,130),(0,0,0,0)); dd=ImageDraw.Draw(tmp)
    w=dd.textlength(t,font=f); dd.text(((760-w)/2,10),t,font=f,fill=(240,240,232,255))
    r=tmp.rotate(angle,expand=True); im.paste(r,(360-r.width//2,560-r.height//2),r)
def build(kind):
    im,d=scene()
    if kind=='h_cc': im,d=pole(im,d,150,570); text_h(im,d,'CC-0123')
    elif kind=='v_stack': im,d=pole(im,d,240,480); text_stack(im,d,'CC-0457')
    elif kind=='v_rot': im,d=pole(im,d,240,480); text_rot(im,'WP-0088',angle=90)
    elif kind=='fdu':
        a=np.array(im).astype(float); a[300:1100,80:640]=[188,190,192]; a[300:1100,80:640]+=np.random.default_rng(5).normal(0,9,(800,560,3)); im=Image.fromarray(np.clip(a,0,255).astype('uint8')); d=ImageDraw.Draw(im)
        d.rectangle([110,560,610,740],fill=(250,250,250)); f=_font(84); t='FDU_100'; w=d.textlength(t,font=f); d.text(((720-w)/2,600),t,font=f,fill=(20,20,20))
    elif kind=='dark':
        im,d=pole(im,d,150,570); text_h(im,d,'CC-0123'); im=Image.fromarray((np.array(im)*0.12).astype('uint8'))
    elif kind=='soft':  # slightly out of focus: passes Normal, refused by Strict
        im,d=pole(im,d,150,570); text_h(im,d,'CC-0123'); im=im.filter(ImageFilter.GaussianBlur(1.2))
    elif kind=='blur':
        im,d=pole(im,d,150,570); text_h(im,d,'CC-0123'); im=im.filter(ImageFilter.GaussianBlur(5))
    return im
def write(path, im, frames=30):
    b=io.BytesIO(); im.save(b,'JPEG',quality=92); j=b.getvalue()
    open(path,'wb').write(j*frames)
if __name__=='__main__':
    out=sys.argv[1]
    for k in ['h_cc','v_stack','v_rot','fdu','dark','soft','blur']:
        im=build(k); im.save(f'{out}/{k}.jpg',quality=90); write(f'{out}/{k}.mjpeg',im)
    print('ok')
