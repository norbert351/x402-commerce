import subprocess, os, sys
os.makedirs("/home/ubuntu/x402-commerce/nar", exist_ok=True)
os.chdir("/home/ubuntu/x402-commerce/nar")
EDGE = "/home/ubuntu/.hermes/hermes-agent/venv/bin/edge-tts"
VOICE = "en-US-ChristopherNeural"

lines = json_struct = [
    [7.8,  "xPay Commerce. Agents paying agents, micro payments per call."],
    [10.6, "Pick any symbol and resource behind the gate."],
    [13.7, "Typing a custom symbol and choosing the richer ticker feed."],
    [17.1, "Unlock without paying? The server answers 402 with an x402 challenge."],
    [23.0, "Now a real agent wallet settles a United Stables micro payment, on chain."],
    [34.3, "Payment confirmed on chain. It signs the proof and replays, authorized."],
    [41.0, "The ledger updates live. One transfer equals one request, replay protected."],
    [45.7, "And the same paid tools serve any AI agent over MCP."],
    [50.8, "xPay Commerce. Pay per call commerce on Binance Agent OS, live now."],
]
# spec anchors were cut-relative in the FINAL 60.2s video. Running-end placement.
import json
window = 60.2

# 1) TTS each line -> mono 44.1k pcm wav
frags = []  # list of {start, end, wav}
pos = 0.0
for i, (anchor, text) in enumerate(lines):
    mp3 = f"c{i}.mp3"; wav = f"c{i}.wav"
    subprocess.run([EDGE, "--voice", VOICE, "--rate=+34%", "--text", text, "--write-media", mp3], check=True, capture_output=True)
    dur = float(subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",mp3], capture_output=True, text=True).stdout.strip())
    subprocess.run(["ffmpeg","-v","error","-y","-i",mp3,"-ar","44100","-ac","1","-c:a","pcm_s16le",wav], check=True)
    # non-overlapping start
    start = max(anchor, pos)
    end = start + dur
    frags.append({"start": start, "end": end, "wav": wav})
    pos = end
print("FRAGS", [(round(f['start'],1), round(f['end'],1)) for f in frags], "| last end", round(pos,1))

# 2) build sequence: [silence gap][clip]..., starting from 0, ending at window
pieces = []
def sil(wavname, dur):
    if dur <= 0.005: return None
    subprocess.run(["ffmpeg","-v","error","-y","-f","lavfi","-i","anullsrc=r=44100:cl=mono","-t",f"{dur:.3f}","-c:a","pcm_s16le",wavname], check=True)
    return wavname

cursor = 0.0
for i, f in enumerate(frags):
    g = sil(f"s{i}.wav", f["start"] - cursor)
    if g: pieces.append(g)
    pieces.append(f["wav"])
    cursor = f["end"]
tail = window - cursor
if tail > 0.01:
    g = sil("s_tail.wav", tail)
    if g: pieces.append(g)

with open("concat.txt","w") as fh:
    for p in pieces:
        fh.write(f"file '{p}'\n")
print("pieces", len(pieces))

subprocess.run(["ffmpeg","-v","error","-y","-f","concat","-safe","0","-i","concat.txt","-c:a","pcm_s16le","full.wav"], check=True)
d = float(subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0","full.wav"], capture_output=True, text=True).stdout.strip())
print("FULL_WAV_DUR", round(d,2))
subprocess.run(["ffmpeg","-v","error","-y","-i","full.wav","-c:a","aac","-b:a","128k","nar.m4a"], check=True)
v = subprocess.run(["ffmpeg","-v","info","-i","nar.m4a","-af","volumedetect","-f","null","-"], capture_output=True, text=True).stderr
mv=[l for l in v.splitlines() if "mean_volume" in l or "max_volume" in l]
print("NAR_DONE", mv[0].strip() if mv else "", mv[1].strip() if len(mv)>1 else "")