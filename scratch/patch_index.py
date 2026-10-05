import re

file_path = "f:/AI Projects/Hamsa Vidya Website/index.html"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Add Mermaid.js to index.html before marked.min.js
if "mermaid.min.js" not in content:
    content = content.replace(
        '<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>',
        '<script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>\n  <script>mermaid.initialize({startOnLoad: false, theme: "default"});</script>\n  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>'
    )

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("Updated index.html to include mermaid.js.")
