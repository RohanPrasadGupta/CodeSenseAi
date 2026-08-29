from app.services.parser import parse_file

chunks = parse_file("app/services/ingestion.py", "python")
for chunk in chunks:
    print(f"{chunk.type} | {chunk.name} | lines {chunk.start_line}-{chunk.end_line}")