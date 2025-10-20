import re
import json

def parse_sql_schema(sql_content):
    tables = {} #tempat untuk simpan table dan kolom
    lines = sql_content.split('\n') #pecah sql jadi perbaris
    
    in_create_table = False #penanda kalo lagi daalm definisi create table
    current_table_name = None #nama tbael yg sedang di proses
    
    for line in lines:
        line = line.strip() #buang spasi depan belakang
        
        if line.startswith("CREATE TABLE"):
            in_create_table = True
            match = re.search(r"CREATE TABLE public.(\w+)", line)
            if match:
                current_table_name = match.group(1)
                tables[current_table_name] = {
                    "description": "",
                    "business_context": "",
                    "common_queries": [],
                    "key_columns": {},
                    "foreign_keys": []
                }
        elif in_create_table:
            if line.startswith(")"):
                in_create_table = False
                current_table_name = None
            else:
                match = re.match(r"(\w+)", line)
                if match and current_table_name:
                    column_name = match.group(1)
                    tables[current_table_name]["key_columns"][column_name] = ""

    # cari komen pada sql schema
    comment_regex = re.compile(r"COMMENT ON COLUMN public.(\w+).(\w+) IS '(.*?)';", re.DOTALL)

    # isi komentar ke dalam dictionary table
    for match in comment_regex.finditer(sql_content):
        table_name, column_name, comment = match.groups()
        if table_name in tables and column_name in tables[table_name]["key_columns"]:
            # bersihkan teks komen
            comment = comment.replace("''", "'").strip()
            tables[table_name]["key_columns"][column_name] = comment

    return tables

def generate_knowledge_base(sql_file_path, output_file_path, reference_kb_file_path):
    # baca isi schema SQL
    with open(sql_file_path, 'r') as f:
        sql_content = f.read()
    
    # baca knowldege base refrensi    
    with open(reference_kb_file_path, 'r') as f:
        reference_kb = json.load(f)

    #parisng tabel & kolom dari schema SQL
    parsed_tables = parse_sql_schema(sql_content)
    
    #  create knowledege base baru dengan format file refrensi
    new_kb = {
        "database_info": reference_kb.get("database_info", {}),
        "tables": parsed_tables,
        "domainMappings": reference_kb.get("domainMappings", {}),
        "relationships": reference_kb.get("relationships", {})
    }

    #simpan hasil knowledgebase pada file JSON baru
    with open(output_file_path, 'w') as f:
        json.dump(new_kb, f, indent=2)

if __name__ == '__main__':
    generate_knowledge_base(
        '/home/dinda/LLM-project/knowledge-base/schema231.sql', #file schema 
        '/home/dinda/LLM-project/knowledge-base/knowledge-base-draft-new.json', #hasil knowledge base baru
        '/home/dinda/LLM-project/knowledge-base/knowledge-base.json' #file knowledge base refrensi
    )
