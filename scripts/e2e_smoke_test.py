"""Optional browser smoke test (needs: pip install playwright && playwright install chromium).
Start the backend and frontend first, then: python scripts/e2e_smoke_test.py
Screenshots are written to scripts/screenshots/."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
BASE = "http://127.0.0.1:5173"
ROOT = Path(__file__).resolve().parent
OUT = ROOT / "screenshots"
OUT.mkdir(exist_ok=True)
SAMPLE = ROOT.parent / "backend" / "sample_documents" / "demo_new_prescription_dermatology.pdf"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox","--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream"])
        ctx = await b.new_context(viewport={"width":1400,"height":900})
        page = await ctx.new_page()
        errors=[]
        page.on("console", lambda m: m.type=="error" and errors.append(m.text))
        page.on("pageerror", lambda e: errors.append(str(e)))
        await page.goto(BASE+"/"); await page.wait_for_timeout(800); await page.screenshot(path=str(OUT / "01_landing.png"), full_page=True)
        await page.goto(BASE+"/login"); await page.screenshot(path=str(OUT / "02_login.png"))
        await page.click("text=Log in as demo patient"); await page.wait_for_url("**/app"); await page.wait_for_timeout(1500)
        await page.screenshot(path=str(OUT / "03_dashboard.png"), full_page=True)
        for name,path in [("04_records","/app/records"),("05_consultations","/app/consultations"),("06_medications","/app/medications"),("07_appointments","/app/appointments"),("08_family","/app/family"),("09_settings","/app/settings"),("10_voice","/app/voice"),("11_upload","/app/records/upload")]:
            await page.goto(BASE+path); await page.wait_for_timeout(1200); await page.screenshot(path=str(OUT / f"{name}.png"), full_page=True)
        # upload + review
        await page.set_input_files("[data-testid=file-input]", str(SAMPLE))
        await page.click("text=Upload and extract"); await page.wait_for_url("**/app/records/*"); await page.wait_for_timeout(1500)
        await page.screenshot(path=str(OUT / "12_review.png"), full_page=True)
        await page.check("text=I have checked these details against the original document and they are correct.")
        await page.click("text=Confirm and save"); await page.wait_for_timeout(1500)
        await page.screenshot(path=str(OUT / "13_confirmed.png"), full_page=True)
        # assistant
        await page.goto(BASE+"/app/assistant"); await page.wait_for_timeout(800)
        await page.fill("#ask","What medicines did my doctor prescribe during my previous consultation?"); await page.click("[aria-label='Send question']")
        await page.wait_for_timeout(2500); await page.screenshot(path=str(OUT / "14_assistant.png"), full_page=True)
        # mobile
        m = await b.new_context(viewport={"width":390,"height":844}, is_mobile=True)
        mp = await m.new_page()
        mp.on("pageerror", lambda e: errors.append("mobile:"+str(e)))
        await mp.goto(BASE+"/login"); await mp.click("text=Log in as demo patient"); await mp.wait_for_url("**/app"); await mp.wait_for_timeout(1500)
        await mp.screenshot(path=str(OUT / "15_mobile_dash.png"), full_page=False)
        await mp.click("[aria-label='Open menu']"); await mp.wait_for_timeout(400); await mp.screenshot(path=str(OUT / "16_mobile_menu.png"))
        print("ERRORS:", errors)
        await b.close()
asyncio.run(main())
