#! /usr/bin/env python

'''
vTbgenerator.py -- generate verilog module Testbench
generated bench file like this:

        fifo_sc #(
            .DATA_WIDTH ( 8 ),
            .ADDR_WIDTH ( 8 )
        )
         u_fifo_sc (
            .CLK   ( CLK                     ),
            .RST_N ( RST_N                   ),
            .RD_EN ( RD_EN                   ),
            .WR_EN ( WR_EN                   ),
            .DIN   ( DIN   [DATA_WIDTH-1 :0] ),
            .DOUT  ( DOUT  [DATA_WIDTH-1 :0] ),
            .EMPTY ( EMPTY                   ),
            .FULL  ( FULL                    )
        );

Usage:
      python vTbgenerator.py ModuleFileName.v

'''

import os
import re
import sys
import glob 
import shutil
import chardet
import linecache


def delComment( Text ):
    """ removed comment """
    single_line_comment = re.compile(r"//(.*)$", re.MULTILINE)
    multi_line_comment  = re.compile(r"/\*(.*?)\*/",re.DOTALL)
    Text = multi_line_comment.sub('\n',Text)
    Text = single_line_comment.sub('\n',Text)
    return Text

def delBlock( Text ) :
    """ removed task and function block """
    Text = re.sub(r'\Wtask\W[\W\w]*?\Wendtask\W','\n',Text)
    Text = re.sub(r'\Wfunction\W[\W\w]*?\Wendfunction\W','\n',Text)
    return Text

def findName(inText):
    """ find module name and port list"""
    p = re.search(r'([a-zA-Z_][a-zA-Z_0-9]*)\s*',inText)
    mo_Name = p.group(0).strip()
    return mo_Name

def paraDeclare(inText ,portArr) :
    """ find parameter declare """
    pat = r'\s'+ portArr + r'\s[\w\W]*?[;,)]'
    ParaList = re.findall(pat ,inText)

    return ParaList

def portDeclare(inText ,portArr) :
    """find port declare, Syntax:
       input [ net_type ] [ signed ] [ range ] list_of_port_identifiers

       return list as : (port, [range])
    """
    port_definition = re.compile(
        r'\b' + portArr +
        r''' (\s+(wire|reg)\s+)* (\s*signed\s+)*  (\s*\[.*?:.*?\]\s*)*
        (?P<port_list>.*?)
        (?= \binput\b | \boutput\b | \binout\b | ; | \) )
        ''',
        re.VERBOSE|re.MULTILINE|re.DOTALL
    )

    pList = port_definition.findall(inText)

    t = []
    for ls in pList:
        if len(ls) >=2  :
            t = t+ portDic(ls[-2:])
    return t

def portDic(port) :
    """delet as : input a =c &d;
        return list as : (port, [range])
    """
    pRe = re.compile(r'(.*?)\s*=.*', re.DOTALL)

    pRange = port[0]
    pList  = port[1].split(',')
    pList  = [ i.strip() for i in pList if i.strip() !='' ]
    pList  = [(pRe.sub(r'\1', p), pRange.strip() ) for p in pList ]

    return pList

def formatPort(AllPortList,isPortRange =1) :
    PortList = AllPortList[0] + AllPortList[1] + AllPortList[2]

    str =''
    if PortList !=[] :
        l1 = max([len(i[0]) for i in PortList])+2
        l3 = max(24, l1)

        strList = []
        for pl in AllPortList :
            if pl  != [] :
                str = ',\n'.join( [' '*4+'.'+ i[0].ljust(l3)
                                  + '( '+ (i[0].ljust(l1 )) + ' )' for i in pl ] )
                strList = strList + [ str ]

        str = ',\n\n'.join(strList)

    return str

def formatDeclare(PortList,portArr, initial = "" ):
    str =''

    if PortList!=[] :
        str = '\n'.join( [ portArr.ljust(4) +'  '+(i[1]+min(len(i[1]),1)*'  '
                           +i[0]) + ';' for i in PortList])
    return str

def formatPara(ParaList) :
    paraDec = ''
    paraDef = ''
    if ParaList !=[]:
        s = '\n'.join( ParaList)
        pat = r'([a-zA-Z_][a-zA-Z_0-9]*)\s*=\s*([\w\W]*?)\s*[;,)]'
        p = re.findall(pat,s)

        l1 = max([len(i[0] ) for i in p])
        l2 = max([len(i[1] ) for i in p])
        paraDec = '\n'.join( ['parameter %s = %s;'
                             %(i[0].ljust(l1 +1),i[1].ljust(l2 ))
                             for i in p])
        paraDef =  '#(\n' +',\n'.join( ['    .'+ i[0].ljust(l1 +1)
                    + '( '+ i[1].ljust(l2 )+' )' for i in p])+ ')\n'
    return paraDec,paraDef

def getmodeinfo(path):
    lines = []
    line_cnt = 0

    mode_line = 0

    configFile = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),"CONFIG")
    fp = open(configFile, 'r')
    for line in fp:
        lines.append(line)
        line_cnt = line_cnt + 1
        if line == "SOC_MODE.soc\n":
            mode_line = line_cnt
    fp.close()

    mode = lines[mode_line].replace('\n', '')
    return mode

def writeTestBench(input_file,current_path):
    """ write testbench to file """
    with open(input_file, 'rb') as f:
        f_info =  chardet.detect(f.read())
        f_encoding = f_info['encoding']
    with open(input_file, encoding=f_encoding) as inFile:
        inText  = inFile.read()

    # removed comment,task,function
    inText = delComment(inText)
    inText = delBlock  (inText)

    # moduel ... endmodule  #
    moPos_begin = re.search(r'(\b|^)module\b', inText ).end()
    moPos_end   = re.search(r'\bendmodule\b', inText ).start()
    inText = inText[moPos_begin:moPos_end]

    name  = findName(inText)
    paraList = paraDeclare(inText,'parameter')
    paraDec , paraDef = formatPara(paraList)

    ioPadAttr = [ 'input','output','inout']
    input  =  portDeclare(inText,ioPadAttr[0])
    output =  portDeclare(inText,ioPadAttr[1])
    inout  =  portDeclare(inText,ioPadAttr[2])

    portList = formatPort( [input , output , inout] )
    input  = formatDeclare(input ,'reg', '0' )
    output = formatDeclare(output ,'wire')
    inout  = formatDeclare(inout ,'wire')

    #write Instance
    instance_data = "\n"
    # module_parameter_port_list
    if (paraDec != ''):
        instance_data += "// " + name + " Parameters\n" + paraDec + "\n"

    # list_of_port_declarations
    instance_data += "// " + name + " Inputs\n" + input + "\n"
    instance_data += "// " + name + " Outputs\n" + output + "\n"
    if (inout != ''):
        instance_data += "// " + name + " Bidirs\n" + inout + "\n"

    instance_data += name + " " + paraDef + " " + name + "_u (\n" + portList + "\n);\n"
    
    # write in file
    mode = getmodeinfo(current_path)
    if mode == "none" :
        fp = open(os.path.join(current_path,"user/sim/testbench.v").replace("\\", "/"), 'r')
        lines = []
        line_cnt = 0
        instance_line = 0
        for line in fp:
            line_cnt = line_cnt + 1
            lines.append(line)
            if line.startswith("//Instance") :
                instance_line = line_cnt - 2
        fp.close()
        
        lines.insert(instance_line, instance_data)
        s = ''.join(lines)
        fp = open(os.path.join(current_path,"user/sim/testbench.v").replace("\\", "/"), 'w')
        fp.write(s)
        fp.close()
    else:
        lines = []
        line_cnt = 0
        instance_line = 0
        fp = open(os.path.join(current_path,"user/Hardware/sim/testbench.v").replace("\\", "/"), 'r')
        for line in fp:
            line_cnt = line_cnt + 1
            lines.append(line)
            if line.startswith("//Instance"):
                instance_line = line_cnt - 2
        fp.close()
        
        lines.insert(instance_line, instance_data)
        s = ''.join(lines)
        fp = open(os.path.join(current_path,"user/Hardware/sim/testbench.v").replace("\\", "/"), 'w')
        fp.write(s)
        fp.close()

if __name__ == '__main__':
    writeTestBench(sys.argv[2],sys.argv[1])
