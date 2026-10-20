"""Real codecs and parsers, including output content and resource failure cleanup."""
import io
import json
from pathlib import Path
import subprocess
import tempfile

from docx import Document
from PIL import Image
from pypdf import PdfReader, PdfWriter
import pytest
import conversion
from conversion import ConversionService, ConversionError, ConversionBusy, targets_for


@pytest.fixture
def service(tmp_path, monkeypatch):
    monkeypatch.setattr(tempfile, 'tempdir', str(tmp_path))
    yield ConversionService()
    assert not list(tmp_path.glob('resapo-convert-*')), 'Temporary inputs/results must be removed'


@pytest.fixture(scope='module')
def video(tmp_path_factory):
    folder = tmp_path_factory.mktemp('media')
    path = folder / 'fixture.mp4'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=green:s=160x120:r=15:d=2',
                    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:v', 'libx264',
                    '-threads', '1', '-c:a', 'aac', str(path)], check=True)
    return path.read_bytes()


def probe(data, extension, tmp_path):
    path = tmp_path / ('converted.' + extension)
    path.write_bytes(data)
    return json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(path)]))


@pytest.mark.parametrize('target,codec', [('mp3','mp3'),('m4a','aac'),('wav','pcm_s16le'),
                                         ('flac','flac'),('ogg','vorbis'),('opus','opus')])
def test_video_audio_extraction_preserves_audio_duration_not_video_duration(service, video, target, codec, tmp_path):
    result = service.convert('video.mp4', video, target)
    info = probe(result.data, target, tmp_path)
    assert len(info['streams']) == 1
    assert info['streams'][0]['codec_name'] == codec
    assert .9 < float(info['format']['duration']) < 1.2


@pytest.mark.parametrize('target,codec', [('webm','vp9'),('mkv','h264'),('mp4','h264')])
def test_video_transcoding_with_real_codecs(service, video, target, codec, tmp_path):
    # Use MKV as the source for MP4; same-format copying is intentionally excluded.
    name = 'video.mp4'
    if target == 'mp4':
        video = service.convert(name, video, 'mkv').data
        name = 'video.mkv'
    result = service.convert(name, video, target)
    info = probe(result.data, target, tmp_path)
    stream = next(s for s in info['streams'] if s['codec_type'] == 'video')
    assert stream['codec_name'] == codec
    assert (stream['width'], stream['height']) == (160, 120)
    assert 1.8 < float(info['format']['duration']) < 2.2


def test_video_preserves_display_aspect_for_non_square_pixels(service, tmp_path):
    path = tmp_path / 'anamorphic.mp4'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=s=160x120:d=1',
                    '-vf', 'setsar=2/1', '-c:v', 'libx264', '-threads', '1', str(path)], check=True)
    result = service.convert(path.name, path.read_bytes(), 'mkv')
    info = probe(result.data, 'mkv', tmp_path)
    stream = info['streams'][0]
    assert (stream['width'], stream['height']) == (320, 120)
    assert stream['sample_aspect_ratio'] == '1:1'


@pytest.mark.parametrize('target,format_name', [('jpg','JPEG'),('webp','WEBP'),('bmp','BMP'),('tiff','TIFF'),('png','PNG')])
def test_image_encoding_and_transparency(service, target, format_name):
    source = Image.new('RGBA', (80, 60), (20, 100, 50, 0))
    source.putpixel((20, 20), (20, 100, 50, 255))
    buffer = io.BytesIO()
    source.save(buffer, format='TIFF' if target == 'png' else 'PNG')
    result = service.convert('photo.tiff' if target == 'png' else 'photo.png', buffer.getvalue(), target)
    with Image.open(io.BytesIO(result.data)) as image:
        assert image.format == format_name
        assert image.size == (80, 60)
        if target in {'jpg', 'bmp'}:
            assert min(image.convert('RGB').getpixel((0, 0))) > 245
        else:
            assert image.convert('RGBA').getpixel((0, 0))[3] == 0


def test_image_to_real_pdf(service):
    buffer = io.BytesIO()
    Image.new('RGB', (200, 100), 'green').save(buffer, format='PNG')
    result = service.convert('image.png', buffer.getvalue(), 'pdf')
    document = PdfReader(io.BytesIO(result.data))
    assert len(document.pages) == 1
    assert len(document.pages[0].images) == 1


def test_text_pdf_docx_roundtrip_and_unicode(service):
    text = 'Re-SAPO: acción, corazón y pingüino.\nSegunda línea de prueba.'
    pdf = service.convert('../../prueba.txt', text.encode(), 'pdf')
    assert pdf.name == 'prueba-resapo.pdf'
    parsed = PdfReader(io.BytesIO(pdf.data))
    assert 'corazón y pingüino' in parsed.pages[0].extract_text()
    docx = service.convert('prueba.pdf', pdf.data, 'docx')
    assert 'Segunda línea' in '\n'.join(p.text for p in Document(io.BytesIO(docx.data)).paragraphs)
    txt = service.convert('prueba.docx', docx.data, 'txt')
    assert 'acción' in txt.data.decode()
    assert service.convert('bom.txt', text.encode('utf-16'), 'pdf').data.startswith(b'%PDF')


def test_long_paragraph_wraps_and_multiple_pages_keep_text(service):
    text = '\n'.join(f'Fila {i}: información importante para estudiar.' for i in range(150))
    result = service.convert('study.md', text.encode(), 'pdf')
    pages = PdfReader(io.BytesIO(result.data)).pages
    assert len(pages) > 1
    assert 'Fila 149:' in '\n'.join(page.extract_text() for page in pages)


def test_scanned_and_encrypted_pdf_rejected_without_inventing_text(service):
    writer = PdfWriter()
    writer.add_blank_page(width=100, height=100)
    buffer = io.BytesIO(); writer.write(buffer)
    with pytest.raises(ConversionError, match='OCR'):
        service.convert('scan.pdf', buffer.getvalue(), 'txt')
    writer.encrypt('test-password')
    buffer = io.BytesIO(); writer.write(buffer)
    with pytest.raises(ConversionError, match='contraseña'):
        service.convert('encrypted.pdf', buffer.getvalue(), 'txt')


def test_animated_images_not_silently_flattened(service):
    buffer = io.BytesIO()
    Image.new('RGB', (30, 30), 'red').save(buffer, format='GIF', save_all=True,
        append_images=[Image.new('RGB', (30, 30), 'blue')], duration=100, loop=0)
    with pytest.raises(ConversionError, match='animaciones'):
        service.convert('animated.gif', buffer.getvalue(), 'png')


def test_invalid_formats_content_and_limits(service):
    assert 'mp3' in targets_for('clip.mp4') and 'pdf' not in targets_for('clip.mp4')
    assert 'jpg' not in targets_for('photo.jpeg')
    for name, data, target in [('a.txt', b'hello', 'mp3'), ('a.exe', b'a', 'pdf'),
                                ('a.png', b'corrupt', 'jpg'), ('a.txt', b'', 'pdf'),
                                ('a.txt', b'a' * (5 * 1024 * 1024 + 1), 'pdf')]:
        with pytest.raises(ConversionError):
            service.convert(name, data, target)


def test_busy_and_deadline_release_slots_and_remove_files(service, monkeypatch):
    with service.reserve():
        with pytest.raises(ConversionBusy):
            service.convert('a.txt', b'hello', 'pdf')
    monkeypatch.setattr(conversion, 'TIMEOUT', .001)
    with pytest.raises(ConversionError, match='tardó demasiado'):
        service.convert('a.txt', b'hello', 'pdf')
    monkeypatch.setattr(conversion, 'TIMEOUT', 180)
    assert service.convert('a.txt', b'hello again', 'pdf').data.startswith(b'%PDF')
