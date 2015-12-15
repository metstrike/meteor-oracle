
accept SID char default XE prompt 'Enter SID [XE]: '
accept sys_password char default manager prompt 'Enter SYS password: ' hide

prompt Connecting as SYS
connect sys/&&sys_password@&&SID as sysdba

create user meteor identified by meteor;

grant connect, resource to meteor;

grant execute on dbms_flashback to meteor;

exit

