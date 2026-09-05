import subprocess, os, json, sys
EDGE = "/home/ubuntu/.hermes/hermes-agent/venv/bin/edge-tts"
VOICE = "en-US-ChristopherNeural"

# load spec from the INVOKING cwd (repo), before chdir
data = json.load(open(sys.argv[1]))
os.chdir("/home/ubuntu/x402-commerce/nar")

# caps: anchors (cut-seconds) + one line each
window = data["window"]
anchors = [(a, t) for a, t in data["lines"]]

# generate clips + durations
clips = []
for i, (anchor, text) in enumerate(anchors):
    out = f"n{i}.mp3"
    subprocess.run([EDGE, "--voice", VOICE, "--rate=+34%", "--text", text, "--write-media", out], check=True, capture_output=True)
    d = float(subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",out], capture_output=True, text=True).stdout.strip())
    clips.append((i, anchor, out, d))
print("RAW_CLIPS", [(i, round(a,1), round(d,2)) for i,a,o,d in clips])

# FIX: place each clip at a NON-OVERLAPPING start = max(anchor, prev_end)
place = []
end = 0.0
for i, anchor, out, d in clips:
    start = max(anchor, end)
    place.append((i, start, out, d))
    end = start + d
print("PLACED", [(i, round(s,1), round(s+d,1)) for i,s,o,d in place])

# silence bed of `window`
subprocess.run(["ffmpeg","-v","error","-y","-f","lavfi","-i","anullsrc=r=44100:cl=mono","-t",str(window),"-c:a","pcm_s16le","bed.wav"], check=True)
inputs=["-i","bed.wav"]; filters=["[0:a]volume=0.0[b]"]; mix="[b]"
for k,(i,start,out,d) in enumerate(place):
    msec=int(round(start*1000)); inputs += ["-i", out]
    filters.append(f"[{k+1}:a]adelay={msec}|{msec}[c{k}]"); mix += f"[c{k}]"
filters.append(f"{mix}amix=inputs={len(place)+1}:normalize=0:duration=first[out]")
fc=";".join(filters)
subprocess.run(["ffmpeg","-v","error","-y"]+inputs+["-filter_complex",fc,"-map","[out]","-t",str(window),"-c:a","aac","-b:a","128k","nar.m4a"], check=True)
d=subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0","nar.m4a"],capture_output=True,text=True).stdout.strip()
v=subprocess.run(["ffmpeg","-v","info","-i","nar.m4a","-af","volumedetect","-f","null","-"],capture_output=True,text=True).stderr
mv=[l for l in v.splitlines() if "mean_volume" in l or "max_volume" in l]
print("NAR_DONE", d, mv[0].strip() if mv else "", mv[1].strip() if len(mv)>1 else "")