create or replace package meteor_pkg is

	FUNCTION js_number(n IN NUMBER) RETURN VARCHAR2 DETERMINISTIC;

end meteor_pkg;
/

show errors

create or replace package body meteor_pkg is

	FUNCTION js_number(n IN NUMBER) RETURN VARCHAR2 DETERMINISTIC IS
		jsn VARCHAR2(100);
	BEGIN
		jsn := to_char(n);
		if substr(jsn, 0, 1) = '.' then
			jsn := '0'||jsn;
		end if;

		return jsn;
	END;

end meteor_pkg;
/

show errors

exit;

