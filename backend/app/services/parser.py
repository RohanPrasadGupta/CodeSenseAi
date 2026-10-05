import logging
from dataclasses import dataclass
from pathlib import Path
import tree_sitter_python as tspython
import tree_sitter_javascript as tsjavascript
import tree_sitter_go as tsgo
from tree_sitter import Language, Parser
import tree_sitter_typescript as tstypescript


logger = logging.getLogger(__name__)


@dataclass
class CodeChunk:
    file_path: str
    language: str
    type: str
    name: str
    start_line: int
    end_line: int
    code: str
    parent: str | None = None


LANGUAGES = {
    "python": Language(tspython.language()),
    "javascript": Language(tsjavascript.language()),
    "go": Language(tsgo.language()),
    "typescript": Language(tstypescript.language_typescript()),
    "tsx": Language(tstypescript.language_tsx()),
}

NODE_TYPES = {
    "python": {
        "function": "function_definition",
        "class": "class_definition",
    },
    "javascript": {
        "function": ["function_declaration", "method_definition", "arrow_function"],
        "class": "class_declaration",
    },
    "typescript": {
        "function": ["function_declaration", "method_definition"],
        "class": "class_declaration",
    },
    "go": {
        "function": "function_declaration",
        "class": "type_declaration",
    },
    "tsx": {
        "function": ["function_declaration", "method_definition", "arrow_function"],
        "class": "class_declaration",
    },
}

def parse_file(file_path:Path, language:str, display_path:str | None = None) -> list[CodeChunk]:
    """Parse a file into chunks. `display_path` (repo-relative) is what gets
    stored on each chunk; the absolute temp path is only used to read bytes."""
    if language not in LANGUAGES:
        return []
    
    source_code = Path(file_path).read_bytes()
    parser = Parser(LANGUAGES[language])
    tree = parser.parse(source_code)

    chunks = extract_chunks(
        tree.root_node,
        source_code,
        display_path or str(file_path),
        language,
        )
    
    return chunks

def extract_chunks(
    root_node,
    source_code:bytes,
    file_path:str,
    language:str
) -> list[CodeChunk]:
    chunks =  []

    def walk(node,parent_name=None):
        node_type = NODE_TYPES.get(language,{})
        
        function_types = node_type.get("function",[])
        class_types = node_type.get("class",[])

        if isinstance(function_types,str):
            function_types = [function_types]
        
        if isinstance(class_types,str):
            class_types = [class_types]
        
        chunk_type = None

        if node.type in function_types:
            chunk_type = "function"
        elif node.type in class_types:
            chunk_type = "class"
        
        current_name = parent_name

        if chunk_type:
            name_node = node.child_by_field_name("name")

            if name_node:
                name = source_code[name_node.start_byte:name_node.end_byte].decode("utf-8")
            else:
                name = "<anonymous>"
            
            code = source_code[node.start_byte:node.end_byte].decode("utf-8")

            chunk = CodeChunk(
                file_path=file_path,
                language=language,
                type=chunk_type,
                name=name,
                start_line=node.start_point[0] + 1,
                end_line=node.end_point[0] + 1,
                code=code,
                parent=parent_name,
            )
            chunks.append(chunk)
            current_name = name

        for child in node.children:
            walk(child,current_name )
    
    walk(root_node)

    logger.debug("Extracted %d chunks from %s", len(chunks), file_path)

    return chunks
    
