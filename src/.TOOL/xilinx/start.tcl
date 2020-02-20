set_param general.maxThreads 8

variable current_Location [file normalize [info script]]

set device_file     "[file dirname $current_Location]/Data/Device.txt"
set device_file_tmp "[file dirname $current_Location]/Data/Device.txt.tmp"

set device_num      0
set add_param       1

#creat project
set your_chooce  a
while {$your_chooce == "a" || $your_chooce == "d"} {
    puts "---------which device you want to create---------"
    puts "#note:input the number to choose the device"
    puts "#     input the a to Add the device"
    puts "#     input the b to Delete the device"
    puts "#     input the e to exit"
    set fp [open $device_file r]
    while { [gets $fp data] >= 0 } {
        set device_num [expr $device_num + $add_param]
        set device_arr($device_num) $data
        puts "$device_num) $device_arr($device_num)"
    }
    close $fp
    set device_num 0
    puts "---------please input your chooce---------"
    gets stdin your_chooce
    switch $your_chooce {
        a {
            puts "please input the name of device"
            gets stdin Device
            set fp [open $device_file a+]
            puts $fp $Device
            close $fp
        }
        d {
            puts "please input the number of device"
            gets stdin Device_num
            set fd [open $device_file r]
            set newfd [open $device_file_tmp w]
            while {[gets $fd line] >= 0} {
                if {[string compare $line $device_arr($Device_num)] != 0} {
                    set newline $line
                    puts $newfd $newline
                }
            }
            close $fd
            close $newfd
            file rename -force $device_file_tmp $device_file
        }
        e {exit 1;}
    }
}

set fp [open "./config.txt" a+]
puts $fp $device_arr($your_chooce)
close $fp
create_project template ./prj/xilinx -part $device_arr($your_chooce) -force -quiet

#add file
set fp [open "./config.txt" r]
while { [gets $fp config_data] >= 0 } {
	if {[string equal -length 3 $config_data Soc] == 1} {
		gets $fp config_data
		if {[string equal -length 4 $config_data none] == 1} {
			add_file ./.LIB -force -quiet
			add_file ./user/src -force -quiet
			add_file ./user/TOP.v -force -quiet
			#set top
			set_property top TOP [current_fileset]
			#add xdc
			add_files -fileset constrs_1 ./user/data -force -quiet
			#set sim
			set_property SOURCE_SET sources_1 [get_filesets sim_1]
			add_files -fileset sim_1 -norecurse ./user/sim/testbench.v -force -quiet
			set_property top testbench [get_filesets sim_1]
			set_property top_lib xil_defaultlib [get_filesets sim_1]
			update_compile_order -fileset sim_1 -quiet
		} else {
			add_file ./.LIB/Hardware -force -quiet
			add_file ./user/Hardware/src -force -quiet
			add_file ./user/Hardware/TOP.v -force -quiet
			set_property top TOP [current_fileset]
			add_files -fileset constrs_1 ./user/data -force -quiet
			set_property SOURCE_SET sources_1 [get_filesets sim_1]
			add_files -fileset sim_1 -norecurse ./user/Hardware/sim/testbench.v -force -quiet
			update_compile_order -fileset sim_1
			set_property top testbench [get_filesets sim_1]
			set_property top_lib xil_defaultlib [get_filesets sim_1]
			update_compile_order -fileset sim_1
		}
		break
	}
}
close $fp

#source ./.TOOL/xilinx/zynq_ps.tcl -notrace;
source [file dirname $current_Location]/run.tcl -notrace;