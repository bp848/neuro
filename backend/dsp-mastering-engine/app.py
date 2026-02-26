from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from google.cloud import storage
import numpy as np
import scipy.io.wavfile as wavfile
import os
import time
import json
import traceback
from typing import Optional
import audio_logic as dsp
import requests

from supabase import create_client, Client

app = FastAPI(title="Neuro-Master DSP Engine (Python)")

# Initialize Supabase
supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(supabase_url, supabase_key) if supabase_url and supabase_key else None

class MasteringRequest(BaseModel):
    jobId: Optional[str] = None
    inputBucket: str
    inputPath: str
    outputBucket: str
    outputPath: str
    params: Optional[dict] = None
    targetLUFS: Optional[float] = None

storage_client = storage.Client()

@app.get("/")
async def health_check():
    return {"status": "ok", "engine": "Neuro-Master-Python"}

@app.post("/")
async def pubsub_trigger(request: dict):
    """
    Handles Pub/Sub push notifications.
    Expected format: 
    {
        "message": {
            "data": "base64_encoded_json",
            ...
        }
    }
    """
    try:
        if "message" not in request:
            # Direct call support for local testing
            data = request
        else:
            import base64
            pubsub_message = request["message"]
            if "data" in pubsub_message:
                data_str = base64.b64decode(pubsub_message["data"]).decode("utf-8")
                data = json.loads(data_str)
            else:
                raise HTTPException(status_code=400, detail="No data in Pub/Sub message")

        # Reuse existing logic via internal call or refactoring
        # For simplicity, we convert dict to MasteringRequest
        req_obj = MasteringRequest(**data)
        return await process_audio_internal(req_obj)

    except Exception as e:
        print(f"Pub/Sub Handler Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

async def process_audio_internal(request: MasteringRequest):
    try:
        print(f"Processing {request.inputPath} from {request.inputBucket}...")

        # 0. Fetch job info for notification later
        job_info = {}
        if request.jobId and supabase:
            try:
                res = supabase.table("mastering_jobs").select("user_email, file_name").eq("id", request.jobId).execute()
                if res.data:
                    job_info = res.data[0]
            except Exception as e:
                print(f"Warning: Could not fetch job info: {str(e)}")

        # 1. Download from GCS
        local_input = f"/tmp/input_{int(time.time())}.wav"
        bucket = storage_client.bucket(request.inputBucket)
        blob = bucket.blob(request.inputPath)
        blob.download_to_filename(local_input)
        
        # 2. Read WAV
        sample_rate, data = wavfile.read(local_input)
        
        # Convert to float32 range [-1, 1] if needed
        if data.dtype == np.int16:
            data = data.astype(np.float32) / 32768.0
        elif data.dtype == np.int32:
            data = data.astype(np.float32) / 2147483648.0
            
        # Ensure stereo
        if len(data.shape) == 1:
            left = data.copy()
            right = data.copy()
        else:
            left = data[:, 0].copy()
            right = data[:, 1].copy()

        # 3. Parameter setup & Optimization
        params = dsp.MasteringParams(**(request.params or {}))
        
        if request.targetLUFS:
            print(f"Optimizing for target LUFS: {request.targetLUFS}")
            optimized_params, achieved_lufs, iterations = dsp.optimize_mastering_params(
                left, right, sample_rate, request.targetLUFS, params
            )
            params = optimized_params
            print(f"Optimization finished: {achieved_lufs} LUFS in {iterations} iterations")

        # 4. Apply Mastering Chain
        print("Applying mastering chain...")
        dsp.build_mastering_chain(left, right, sample_rate, params)
        
        # 5. Save & Upload
        local_output = f"/tmp/output_{int(time.time())}.wav"
        # Stack back to stereo
        mastered_data = np.stack([left, right], axis=1)
        # Convert back to int16 for compatibility if needed, or keep float32
        # Here we use float32 for high fidelity
        wavfile.write(local_output, sample_rate, mastered_data)
        
        out_bucket = storage_client.bucket(request.outputBucket)
        out_blob = out_bucket.blob(request.outputPath)
        out_blob.upload_from_filename(local_output)
        
        # Metadata update
        out_blob.metadata = {
            "masteredBy": "Neuro-Master-Python",
            "params": json.dumps(dsp.params_to_dict(params) if hasattr(dsp, 'params_to_dict') else str(params))
        }
        out_blob.patch()

        # Cleanup
        os.remove(local_input)
        os.remove(local_output)
        
        if request.jobId and supabase:
            supabase.table("mastering_jobs").update({
                "status": "completed",
                "output_path": f"gs://{request.outputBucket}/{request.outputPath}"
            }).eq("id", request.jobId).execute()

            # Trigger email notification via Vercel Function
            user_email = job_info.get("user_email")
            if user_email:
                try:
                    app_url = os.environ.get("NEXT_PUBLIC_APP_URL", "https://neuro-master-beatport-top-10-ai.vercel.app")
                    notify_url = f"{app_url}/api/notify"
                    print(f"Triggering notification for {user_email} at {notify_url}")
                    requests.post(notify_url, json={
                        "email": user_email,
                        "jobId": request.jobId,
                        "fileName": job_info.get("file_name", "your mastered track")
                    }, timeout=5)
                except Exception as e:
                    print(f"Notification Trigger Failed: {str(e)}")

        return {
            "status": "success",
            "outputPath": f"gs://{request.outputBucket}/{request.outputPath}",
            "appliedParams": params.__dict__
        }

    except Exception as e:
        error_msg = str(e)
        print(f"Error: {error_msg}")
        if request.jobId and supabase:
            try:
                supabase.table("mastering_jobs").update({
                    "status": "failed",
                    "error_message": f"DSP Engine Error: {error_msg}"
                }).eq("id", request.jobId).execute()
            except Exception as db_err:
                print(f"Failed to update error in Supabase: {str(db_err)}")
        raise HTTPException(status_code=500, detail=error_msg)

class MasterFromUrlRequest(BaseModel):
    jobId: str
    downloadUrl: str
    fileName: str = "input.wav"
    targetLUFS: Optional[float] = -14.0
    params: Optional[dict] = None


@app.post("/master")
async def master_from_url(request: MasterFromUrlRequest):
    """
    Edge Function から呼ばれる新エンドポイント。
    Supabase Storage の署名付き URL からダウンロードし、
    処理後に Supabase Storage にアップロードする。
    """
    try:
        print(f"[/master] Job {request.jobId}: downloading {request.fileName}")

        if not supabase:
            raise Exception("Supabase client not initialized (check env vars)")

        # 1. 署名付き URL から HTTP ダウンロード
        local_input = f"/tmp/input_{request.jobId}.wav"
        dl_res = requests.get(request.downloadUrl, timeout=300)
        dl_res.raise_for_status()
        with open(local_input, "wb") as f:
            f.write(dl_res.content)
        print(f"[/master] Downloaded {len(dl_res.content)} bytes")

        # 2. WAV 読み込み
        sample_rate, data = wavfile.read(local_input)

        if data.dtype == np.int16:
            data = data.astype(np.float32) / 32768.0
        elif data.dtype == np.int32:
            data = data.astype(np.float32) / 2147483648.0
        elif data.dtype == np.float32:
            pass

        if len(data.shape) == 1:
            left = data.copy()
            right = data.copy()
        else:
            left = data[:, 0].copy()
            right = data[:, 1].copy()

        print(f"[/master] Audio: {sample_rate}Hz, {len(left)} frames, {len(left)/sample_rate:.1f}s")

        # 3. DSP パラメータ設定 + LUFS 最適化
        params = dsp.MasteringParams(**(request.params or {}))

        target = request.targetLUFS or -14.0
        print(f"[/master] Optimizing for {target} LUFS...")
        optimized_params, achieved_lufs, iterations = dsp.optimize_mastering_params(
            left, right, sample_rate, target, params
        )
        params = optimized_params
        print(f"[/master] Optimization: {achieved_lufs:.1f} LUFS in {iterations} iterations")

        # 4. マスタリングチェーン適用
        print("[/master] Applying mastering chain...")
        dsp.build_mastering_chain(left, right, sample_rate, params)

        # 5. WAV 書き出し (float32 高品質)
        local_output = f"/tmp/output_{request.jobId}.wav"
        mastered_data = np.stack([left, right], axis=1)
        wavfile.write(local_output, sample_rate, mastered_data)
        output_size = os.path.getsize(local_output)
        print(f"[/master] Output: {output_size} bytes")

        # 6. Supabase Storage にアップロード
        output_storage_path = f"{request.jobId}/master_{request.fileName}"
        with open(local_output, "rb") as f:
            upload_res = supabase.storage.from_("mastered").upload(
                output_storage_path,
                f.read(),
                {"content-type": "audio/wav", "x-upsert": "true"}
            )
        print(f"[/master] Uploaded to mastered/{output_storage_path}")

        # 7. 署名付きダウンロード URL 生成 (7日間有効)
        signed = supabase.storage.from_("mastered").create_signed_url(
            output_storage_path, 60 * 60 * 24 * 7
        )
        output_url = signed.get("signedURL") or signed.get("signedUrl", "")

        # 8. DB 更新
        final_lufs = dsp.measure_lufs(left, right, sample_rate)
        supabase.table("mastering_jobs").update({
            "status": "completed",
            "output_path": output_storage_path,
            "output_url": output_url,
            "lufs_achieved": round(final_lufs, 2),
            "final_params": dsp.params_to_dict(params),
            "completed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }).eq("id", request.jobId).execute()

        # 9. 通知トリガー
        try:
            job_res = supabase.table("mastering_jobs").select(
                "user_email, file_name"
            ).eq("id", request.jobId).execute()
            if job_res.data:
                job_info = job_res.data[0]
                notify_url = f"{supabase_url}/functions/v1/notify-on-complete"
                requests.post(notify_url, json={
                    "id": request.jobId,
                    "status": "completed",
                    "user_email": job_info.get("user_email"),
                    "file_name": job_info.get("file_name"),
                }, headers={
                    "Authorization": f"Bearer {supabase_key}",
                }, timeout=10)
        except Exception as notify_err:
            print(f"[/master] Notification failed (non-fatal): {notify_err}")

        # Cleanup
        os.remove(local_input)
        os.remove(local_output)

        return {
            "status": "success",
            "jobId": request.jobId,
            "outputUrl": output_url,
            "achievedLUFS": round(final_lufs, 2),
            "iterations": iterations,
            "appliedParams": dsp.params_to_dict(params),
        }

    except Exception as e:
        error_msg = str(e)
        print(f"[/master] ERROR: {error_msg}")
        traceback.print_exc()
        if supabase:
            try:
                supabase.table("mastering_jobs").update({
                    "status": "failed",
                    "error_message": f"DSP Engine: {error_msg}",
                }).eq("id", request.jobId).execute()
            except Exception:
                pass
        for f_path in [f"/tmp/input_{request.jobId}.wav", f"/tmp/output_{request.jobId}.wav"]:
            try:
                os.remove(f_path)
            except Exception:
                pass
        raise HTTPException(status_code=500, detail=error_msg)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
