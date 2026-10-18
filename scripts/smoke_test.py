"""Exercise the running server with a real audio/video file and real Whisper weights."""
import argparse
from pathlib import Path
import time
import httpx

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('file', type=Path)
    parser.add_argument('--language', default='es')
    parser.add_argument('--expect', help='Phrase expected in the actual transcription')
    parser.add_argument('--url', default='http://127.0.0.1:8000')
    args = parser.parse_args()
    with httpx.Client(base_url=args.url, timeout=120) as client:
        with args.file.open('rb') as audio:
            response = client.post('/api/transcriptions', params={
                'filename': args.file.name, 'language': args.language,
            }, content=audio, headers={'Content-Type': 'application/octet-stream'})
        response.raise_for_status()
        job_id = response.json()['id']
        try:
            deadline = time.monotonic() + 1200
            while time.monotonic() < deadline:
                response = client.get(f'/api/transcriptions/{job_id}')
                response.raise_for_status()
                result = response.json()
                if result['state'] in {'completed', 'failed', 'cancelled'}:
                    break
                time.sleep(1)
            else:
                raise RuntimeError('La prueba superó los 20 minutos.')
            if result['state'] != 'completed':
                raise RuntimeError(result['message'])
            if not result['text'].strip():
                raise RuntimeError('No se reconoció voz en la muestra.')
            if args.expect and args.expect.casefold() not in result['text'].casefold():
                raise AssertionError('La transcripción no contiene la frase esperada.')
            print(f"OK: {args.file.name}, {result['duration']:.1f}s, idioma {result['language']}")
            print(result['text'])
        finally:
            client.delete(f'/api/transcriptions/{job_id}')


if __name__ == "__main__":
    main()
