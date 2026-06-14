import sys
import json
import easyocr

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No image path specified"}))
        return
    img_path = sys.argv[1]
    try:
        reader = easyocr.Reader(['en', 'ro'], gpu=False)
        results = reader.readtext(img_path)
        lines = [text for (_bbox, text, _conf) in results]
        confidences = [conf for (_bbox, _text, conf) in results]
        mean_conf = sum(confidences) / len(confidences) if confidences else 0.0
        print(json.dumps({"lines": lines, "confidence": mean_conf}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    main()
